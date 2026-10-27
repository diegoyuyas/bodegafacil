import type { RegistroActividad } from '@/core/actividad';
import type { ConfiguracionRepositorio, UsuarioRepositorio } from '@/core/repositorios';
import { CLAVE_CONTROL_USUARIOS, CLAVE_USUARIOS_RECUPERACION, estaActivado } from '@/core/configuracion';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import {
  INTENTOS_ANTES_DE_BLOQUEAR,
  claveDeNombre,
  segundosDeBloqueo,
  validarClave,
  validarNombreUsuario,
  type ResultadoAcceso,
  type RolUsuario,
  type Usuario,
} from '@/core/usuarios';
import {
  claveCoincide,
  generarClaveRecuperacion,
  normalizarClaveRecuperacion,
  protegerClave,
  type ClaveProtegida,
} from '@/infraestructura/seguridad/clave-usuario';
import type { BaseDatosLocal } from './base-datos';

interface FilaUsuario {
  id: number;
  nombre: string;
  nombre_clave: string;
  rol: string;
  clave_hash: string;
  clave_sal: string;
  clave_iteraciones: number;
  activo: number;
  intentos_fallidos: number;
  bloqueado_hasta: number | null;
  ultimo_acceso: string | null;
  creado_en: string;
  actualizado_en: string;
}

function mapearUsuario(fila: FilaUsuario): Usuario {
  return {
    id: fila.id,
    nombre: fila.nombre,
    rol: fila.rol === 'administrador' ? 'administrador' : 'estandar',
    activo: fila.activo === 1,
    ultimoAcceso: fila.ultimo_acceso,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

const ORDEN = "ORDER BY CASE rol WHEN 'administrador' THEN 0 ELSE 1 END, nombre_clave";

/**
 * Usuarios y contraseñas. Nunca se guarda la contraseña: solo su huella PBKDF2 con sal
 * (ver infraestructura/seguridad/clave-usuario.ts). Los intentos fallidos y el bloqueo
 * temporal se guardan en la base (no en memoria), para que cerrar y abrir la app no los reinicie.
 *
 * Quién puede llamar a cada método (administrador, el propio usuario...) lo decide la
 * pantalla con core/permisos.ts; este repositorio solo cuida que los datos queden bien
 * (por ejemplo, que siempre quede al menos un administrador activo).
 */
export class UsuarioRepositorioSqlite implements UsuarioRepositorio {
  constructor(
    private readonly bd: BaseDatosLocal,
    private readonly configuracion: ConfiguracionRepositorio,
    /** Reloj en milisegundos; se puede cambiar en las pruebas. */
    private readonly reloj: () => number = () => Date.now(),
    private readonly actividad?: RegistroActividad,
  ) {}

  // --- Lectura -----------------------------------------------------------

  hayUsuarios(): boolean {
    return (this.bd.consultar<{ n: number }>('SELECT COUNT(*) AS n FROM usuario')[0]?.n ?? 0) > 0;
  }

  listarTodos(): Usuario[] {
    return this.bd.consultar<FilaUsuario>(`SELECT * FROM usuario ${ORDEN}`).map(mapearUsuario);
  }

  listarActivos(): Usuario[] {
    return this.bd.consultar<FilaUsuario>(`SELECT * FROM usuario WHERE activo = 1 ${ORDEN}`).map(mapearUsuario);
  }

  listarAdministradoresActivos(): Usuario[] {
    return this.bd
      .consultar<FilaUsuario>(`SELECT * FROM usuario WHERE activo = 1 AND rol = 'administrador' ${ORDEN}`)
      .map(mapearUsuario);
  }

  obtenerPorId(id: number): Usuario {
    return mapearUsuario(this.obtenerFila(id));
  }

  private obtenerFila(id: number): FilaUsuario {
    const fila = this.bd.consultar<FilaUsuario>('SELECT * FROM usuario WHERE id = ?', [id])[0];
    if (!fila) throw new ErrorDeNegocio('No se encontró al usuario.');
    return fila;
  }

  private contarAdministradoresActivos(): number {
    return this.bd.consultar<{ n: number }>("SELECT COUNT(*) AS n FROM usuario WHERE activo = 1 AND rol = 'administrador'")[0]?.n ?? 0;
  }

  private existeNombre(nombre: string, exceptoId?: number): boolean {
    const fila = this.bd.consultar<{ id: number }>('SELECT id FROM usuario WHERE nombre_clave = ?', [claveDeNombre(nombre)])[0];
    return fila !== undefined && fila.id !== exceptoId;
  }

  // --- Altas y cambios ---------------------------------------------------

  async crear(datos: { nombre: string; clave: string; rol: RolUsuario }): Promise<Usuario> {
    const nombre = validarNombreUsuario(datos.nombre);
    validarClave(datos.clave);
    if (this.existeNombre(nombre)) throw new ErrorDeNegocio(`Ya existe un usuario llamado ${nombre}.`);

    const protegida = await protegerClave(datos.clave);
    // Se vuelve a mirar después de la espera de la huella, por si otro usuario con el mismo nombre se creó mientras tanto.
    if (this.existeNombre(nombre)) throw new ErrorDeNegocio(`Ya existe un usuario llamado ${nombre}.`);

    this.bd.ejecutar(
      `INSERT INTO usuario (nombre, nombre_clave, rol, clave_hash, clave_sal, clave_iteraciones)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nombre, claveDeNombre(nombre), datos.rol, protegida.hash, protegida.sal, protegida.iteraciones],
    );
    const id = this.bd.ultimoIdInsertado();
    this.actividad?.registrar({ accion: 'usuario_creado', entidad: 'usuario', entidadId: id, detalle: `${nombre} (${datos.rol === 'administrador' ? 'administrador' : 'estándar'})` });
    return this.obtenerPorId(id);
  }

  actualizar(id: number, cambios: { nombre?: string; rol?: RolUsuario; activo?: boolean }): Usuario {
    const actual = this.obtenerFila(id);
    const nombre = cambios.nombre === undefined ? actual.nombre : validarNombreUsuario(cambios.nombre);
    const rol = cambios.rol ?? (actual.rol === 'administrador' ? 'administrador' : 'estandar');
    const activo = cambios.activo ?? actual.activo === 1;

    if (this.existeNombre(nombre, id)) throw new ErrorDeNegocio(`Ya existe un usuario llamado ${nombre}.`);

    // Siempre debe quedar al menos un administrador activo; si no, nadie podría administrar.
    const eraAdministradorActivo = actual.rol === 'administrador' && actual.activo === 1;
    const seguiraSiendolo = rol === 'administrador' && activo;
    if (eraAdministradorActivo && !seguiraSiendolo && this.contarAdministradoresActivos() <= 1) {
      throw new ErrorDeNegocio('Debe quedar al menos un administrador activo.');
    }

    this.bd.ejecutar(
      `UPDATE usuario
         SET nombre = ?, nombre_clave = ?, rol = ?, activo = ?,
             intentos_fallidos = CASE WHEN ? = 0 THEN 0 ELSE intentos_fallidos END,
             bloqueado_hasta = CASE WHEN ? = 0 THEN NULL ELSE bloqueado_hasta END,
             actualizado_en = datetime('now')
       WHERE id = ?`,
      [nombre, claveDeNombre(nombre), rol, activo ? 1 : 0, activo ? 1 : 0, activo ? 1 : 0, id],
    );
    const cambiosTexto = [
      nombre !== actual.nombre ? `nombre de ${actual.nombre} a ${nombre}` : null,
      rol !== actual.rol ? `rol de ${nombre} a ${rol === 'administrador' ? 'administrador' : 'estándar'}` : null,
      activo !== (actual.activo === 1) ? `${nombre} ${activo ? 'activado' : 'desactivado'}` : null,
    ].filter((t): t is string => t !== null);
    if (cambiosTexto.length > 0) {
      this.actividad?.registrar({ accion: 'usuario_modificado', entidad: 'usuario', entidadId: id, detalle: cambiosTexto.join(', ') });
    }
    return this.obtenerPorId(id);
  }

  /** Cambia la contraseña de cualquier usuario (lo hace un administrador) y le quita el bloqueo. */
  async cambiarClave(id: number, claveNueva: string): Promise<void> {
    this.obtenerFila(id);
    validarClave(claveNueva);
    const protegida = await protegerClave(claveNueva);
    this.guardarClave(id, protegida);
    this.actividad?.registrar({ accion: 'clave_cambiada', entidad: 'usuario', entidadId: id, detalle: this.obtenerPorId(id).nombre });
  }

  /** Cambia la contraseña propia: exige la contraseña actual (cuenta los intentos fallidos como en el acceso). */
  async cambiarClavePropia(id: number, claveActual: string, claveNueva: string): Promise<ResultadoAcceso> {
    validarClave(claveNueva);
    const resultado = await this.verificarAcceso(id, claveActual);
    if (!resultado.ok) return resultado;
    await this.cambiarClave(id, claveNueva);
    return resultado;
  }

  private guardarClave(id: number, protegida: ClaveProtegida): void {
    this.bd.ejecutar(
      `UPDATE usuario
         SET clave_hash = ?, clave_sal = ?, clave_iteraciones = ?,
             intentos_fallidos = 0, bloqueado_hasta = NULL, actualizado_en = datetime('now')
       WHERE id = ?`,
      [protegida.hash, protegida.sal, protegida.iteraciones, id],
    );
  }

  // --- Acceso y autorización ---------------------------------------------

  async verificarAcceso(id: number, clave: string, opciones?: { soloAdministrador?: boolean }): Promise<ResultadoAcceso> {
    const fila = this.bd.consultar<FilaUsuario>('SELECT * FROM usuario WHERE id = ?', [id])[0];
    if (!fila || fila.activo !== 1) return { ok: false, motivo: 'inactivo' };
    if (opciones?.soloAdministrador && fila.rol !== 'administrador') return { ok: false, motivo: 'no_es_administrador' };

    const ahora = this.reloj();
    if (fila.bloqueado_hasta !== null && fila.bloqueado_hasta > ahora) {
      return { ok: false, motivo: 'bloqueado', segundosEspera: Math.ceil((fila.bloqueado_hasta - ahora) / 1000) };
    }

    const correcta = await claveCoincide(clave, { hash: fila.clave_hash, sal: fila.clave_sal, iteraciones: fila.clave_iteraciones });
    if (correcta) {
      this.bd.ejecutar(
        `UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = ? WHERE id = ?`,
        [new Date(ahora).toISOString(), id],
      );
      return { ok: true, usuario: this.obtenerPorId(id) };
    }

    const intentos = fila.intentos_fallidos + 1;
    const espera = segundosDeBloqueo(intentos);
    this.bd.ejecutar('UPDATE usuario SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?', [
      intentos,
      espera > 0 ? ahora + espera * 1000 : null,
      id,
    ]);
    if (espera > 0) return { ok: false, motivo: 'bloqueado', segundosEspera: espera };
    return { ok: false, motivo: 'clave_incorrecta', intentosRestantes: INTENTOS_ANTES_DE_BLOQUEAR - (intentos % INTENTOS_ANTES_DE_BLOQUEAR) };
  }

  /** Autorización puntual: un administrador escribe su contraseña para permitir UNA acción a un usuario estándar. */
  autorizarComoAdministrador(adminId: number, clave: string): Promise<ResultadoAcceso> {
    return this.verificarAcceso(adminId, clave, { soloAdministrador: true });
  }

  // --- Control de usuarios (interruptor general) ---------------------------

  /** ¿Está encendido el interruptor? (No mira el plan: eso lo hace `controlUsuariosVigente`.) */
  controlActivadoEnConfiguracion(): boolean {
    return estaActivado(this.configuracion.obtenerValor(CLAVE_CONTROL_USUARIOS));
  }

  activarControl(): void {
    if (this.contarAdministradoresActivos() < 1) {
      throw new ErrorDeNegocio('Primero hay que crear un administrador.');
    }
    this.configuracion.establecerValor(CLAVE_CONTROL_USUARIOS, '1');
    this.actividad?.registrar({ accion: 'control_activado', entidad: 'usuario' });
  }

  /** Apaga el control. No borra a nadie: al volver a encenderlo están los mismos usuarios. */
  desactivarControl(): void {
    this.actividad?.registrar({ accion: 'control_desactivado', entidad: 'usuario' });
    this.configuracion.establecerValor(CLAVE_CONTROL_USUARIOS, '0');
  }

  /**
   * Asistente de la primera vez: crea al primer administrador, enciende el control y devuelve
   * la clave de recuperación (se muestra UNA sola vez, para anotarla).
   */
  async crearPrimerAdministrador(datos: { nombre: string; clave: string }): Promise<{ usuario: Usuario; claveRecuperacion: string }> {
    if (this.hayUsuarios()) throw new ErrorDeNegocio('Ya hay usuarios creados.');
    const usuario = await this.crear({ nombre: datos.nombre, clave: datos.clave, rol: 'administrador' });
    const claveRecuperacion = await this.generarClaveRecuperacion();
    this.activarControl();
    return { usuario, claveRecuperacion };
  }

  // --- Clave de recuperación ---------------------------------------------

  tieneClaveRecuperacion(): boolean {
    return this.configuracion.obtenerValor(CLAVE_USUARIOS_RECUPERACION) !== null;
  }

  /** Crea una clave de recuperación nueva (la anterior deja de servir) y la devuelve para mostrarla una vez. */
  async generarClaveRecuperacion(): Promise<string> {
    const clave = generarClaveRecuperacion();
    const protegida = await protegerClave(normalizarClaveRecuperacion(clave));
    this.configuracion.establecerValor(CLAVE_USUARIOS_RECUPERACION, JSON.stringify(protegida));
    this.actividad?.registrar({ accion: 'clave_recuperacion_nueva', entidad: 'usuario' });
    return clave;
  }

  /**
   * Olvidé mi contraseña de administrador: con la clave de recuperación se pone una contraseña nueva.
   * La clave usada deja de servir y se devuelve una nueva para anotar.
   */
  async restablecerConClaveRecuperacion(
    adminId: number,
    claveRecuperacion: string,
    claveNueva: string,
  ): Promise<{ ok: true; nuevaClaveRecuperacion: string } | { ok: false }> {
    validarClave(claveNueva);
    const fila = this.bd.consultar<FilaUsuario>('SELECT * FROM usuario WHERE id = ?', [adminId])[0];
    if (!fila || fila.activo !== 1 || fila.rol !== 'administrador') return { ok: false };

    const guardada = this.configuracion.obtenerValor(CLAVE_USUARIOS_RECUPERACION);
    if (guardada === null) return { ok: false };
    let protegida: ClaveProtegida;
    try {
      protegida = JSON.parse(guardada) as ClaveProtegida;
    } catch {
      return { ok: false };
    }
    if (!(await claveCoincide(normalizarClaveRecuperacion(claveRecuperacion), protegida))) return { ok: false };

    await this.cambiarClave(adminId, claveNueva);
    return { ok: true, nuevaClaveRecuperacion: await this.generarClaveRecuperacion() };
  }
}
