'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import { PERMISOS_ESTANDAR, descripcionDePermiso } from '@/core/permisos';
import type { UsuarioRepositorio } from '@/core/repositorios';
import {
  MINIMO_CARACTERES_CLAVE,
  ROLES_USUARIO,
  etiquetaDeRol,
  inicialDeUsuario,
  type RolUsuario,
  type Usuario,
} from '@/core/usuarios';
import { CampoClave } from './campo-clave';
import { Interruptor } from './interruptor';
import { MostrarClaveRecuperacion } from './mostrar-clave-recuperacion';
import { PuertaAdministrador } from './puerta-administrador';
import { colorDeUsuario } from './recuadro-usuario';
import { EtiquetaCampo, VentanaFormulario } from './ventana-formulario';

/**
 * Más > Configuración > Administración de Usuarios (Premium).
 *
 *  - Sin usuarios: explica el control y pide crear al primer administrador (y muestra su
 *    clave de recuperación UNA vez).
 *  - Con el control encendido: antes de mostrar nada pide la contraseña de un administrador.
 *  - Ya dentro: interruptor del control, lista de usuarios (crear, cambiar nombre y rol,
 *    desactivar, cambiar contraseña) y la clave de recuperación.
 *
 * Recibe el repositorio por parámetro para poder probarse con una base real sin la pantalla.
 */

function formatearAcceso(iso: string | null): string {
  if (!iso) return 'Aún no ha entrado';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return 'Aún no ha entrado';
  return `Último acceso: ${fecha.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}`;
}

function mensajeDeError(e: unknown, porDefecto: string): string {
  return e instanceof ErrorDeNegocio ? e.message : porDefecto;
}

type Formulario =
  | { tipo: 'nuevo' }
  | { tipo: 'editar'; usuario: Usuario }
  | { tipo: 'clave'; usuario: Usuario }
  | { tipo: 'apagar' }
  | { tipo: 'activar' }
  | { tipo: 'nueva_recuperacion' }
  | { tipo: 'mostrar_recuperacion'; clave: string };

function SelectorDeRol({ valor, onChange }: { valor: RolUsuario; onChange: (rol: RolUsuario) => void }) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label="Rol">
      {ROLES_USUARIO.map((r) => (
        <button
          key={r.valor}
          type="button"
          role="radio"
          aria-checked={valor === r.valor}
          onClick={() => onChange(r.valor)}
          className={`h-12 flex-1 rounded-xl border text-sm font-semibold ${
            valor === r.valor ? 'border-bodega bg-bodega text-white' : 'border-linea bg-white text-tinta'
          }`}
        >
          {r.etiqueta}
        </button>
      ))}
    </div>
  );
}

function FilaUsuario({ usuario, onClick }: { usuario: Usuario; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 py-3 text-left ${usuario.activo ? '' : 'opacity-50'}`}>
        <span
          style={{ backgroundColor: colorDeUsuario(usuario.nombre) }}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl font-extrabold text-white"
        >
          {inicialDeUsuario(usuario.nombre)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-tinta">{usuario.nombre}</span>
          <span className="block text-xs text-tinta/60">
            {etiquetaDeRol(usuario.rol)}
            {!usuario.activo && ' · Desactivado'}
          </span>
          <span className="block text-xs text-tinta/40">{formatearAcceso(usuario.ultimoAcceso)}</span>
        </span>
        <span className="text-tinta/40">›</span>
      </button>
    </li>
  );
}

export function AdministracionUsuarios({
  usuarios,
  esPremium,
  persistir,
  usuarioActual,
  onSesionIniciada,
  onControlCambiado,
}: {
  usuarios: UsuarioRepositorio;
  esPremium: boolean;
  persistir: () => Promise<void>;
  /**
   * Con el control de usuarios rigiendo: quién está usando la app. Un administrador entra directo;
   * un estándar no puede administrar usuarios. `undefined` = no rige ningún control de acceso.
   */
  usuarioActual?: Usuario | null;
  /** Cuando esta pantalla deja a alguien con la sesión iniciada (al crear al primer administrador o al encender el control). */
  onSesionIniciada?: (usuario: Usuario) => void;
  /** Cuando cambian los usuarios o el control, para que la app vuelva a leer quién puede qué. */
  onControlCambiado?: () => void;
}) {
  const [lista, setLista] = useState<Usuario[]>([]);
  const [controlActivo, setControlActivo] = useState(false);
  const [tieneRecuperacion, setTieneRecuperacion] = useState(false);
  const [puertaSuperada, setPuertaSuperada] = useState(false);
  const [clavePrimera, setClavePrimera] = useState<{ clave: string; usuario: Usuario } | null>(null);
  const [formulario, setFormulario] = useState<Formulario | null>(null);

  // Campos de los formularios.
  const [nombre, setNombre] = useState('');
  const [clave, setClave] = useState('');
  const [clave2, setClave2] = useState('');
  const [rol, setRol] = useState<RolUsuario>('estandar');
  const [activo, setActivo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const recargar = useCallback(() => {
    setLista(usuarios.listarTodos());
    setControlActivo(usuarios.controlActivadoEnConfiguracion());
    setTieneRecuperacion(usuarios.tieneClaveRecuperacion());
  }, [usuarios]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  function limpiarCampos() {
    setNombre('');
    setClave('');
    setClave2('');
    setRol('estandar');
    setActivo(true);
    setError(null);
  }

  function abrir(f: Formulario) {
    limpiarCampos();
    if (f.tipo === 'editar') {
      setNombre(f.usuario.nombre);
      setRol(f.usuario.rol);
      setActivo(f.usuario.activo);
    }
    setFormulario(f);
  }

  function cerrar() {
    setFormulario(null);
    limpiarCampos();
  }

  /** Ejecuta una operación que escribe en la base: la guarda y muestra el error de negocio si lo hay. */
  async function ejecutar(operacion: () => Promise<void> | void, mensajeFallo: string, avisarCambio = true): Promise<boolean> {
    if (trabajando) return false;
    setTrabajando(true);
    setError(null);
    try {
      await operacion();
      await persistir();
      recargar();
      if (avisarCambio) onControlCambiado?.();
      return true;
    } catch (e) {
      setError(mensajeDeError(e, mensajeFallo));
      return false;
    } finally {
      setTrabajando(false);
    }
  }

  function validarCoincidencia(): boolean {
    if (clave !== clave2) {
      setError('Las contraseñas no coinciden.');
      return false;
    }
    return true;
  }

  // --- Acciones ----------------------------------------------------------

  async function crearPrimerAdministrador() {
    if (!validarCoincidencia()) return;
    const resultado: { clave: string | null; usuario: Usuario | null } = { clave: null, usuario: null };
    // No se avisa el cambio todavía: si la app ya pidiera acceso, taparía la clave de recuperación antes de anotarla.
    const ok = await ejecutar(
      async () => {
        const r = await usuarios.crearPrimerAdministrador({ nombre, clave });
        resultado.clave = r.claveRecuperacion;
        resultado.usuario = r.usuario;
      },
      'No se pudo crear al administrador.',
      false,
    );
    if (ok && resultado.clave && resultado.usuario) {
      limpiarCampos();
      setClavePrimera({ clave: resultado.clave, usuario: resultado.usuario });
    }
  }

  async function crearUsuario() {
    if (!validarCoincidencia()) return;
    if (await ejecutar(async () => void (await usuarios.crear({ nombre, clave, rol })), 'No se pudo crear el usuario.')) cerrar();
  }

  async function guardarCambios(usuario: Usuario) {
    if (await ejecutar(() => void usuarios.actualizar(usuario.id, { nombre, rol, activo }), 'No se pudieron guardar los cambios.')) cerrar();
  }

  async function cambiarClave(usuario: Usuario) {
    if (!validarCoincidencia()) return;
    if (await ejecutar(() => usuarios.cambiarClave(usuario.id, clave), 'No se pudo cambiar la contraseña.')) cerrar();
  }

  async function alternarControl() {
    abrir({ tipo: controlActivo ? 'apagar' : 'activar' });
  }

  /** Enciende el control después de que un administrador confirme su contraseña; esa persona queda con la sesión iniciada. */
  async function activarControl(administrador: Usuario) {
    if (await ejecutar(() => usuarios.activarControl(), 'No se pudo activar el control.', false)) {
      onSesionIniciada?.(administrador);
      onControlCambiado?.();
      setPuertaSuperada(true);
      cerrar();
    }
  }

  async function apagarControl() {
    if (await ejecutar(() => usuarios.desactivarControl(), 'No se pudo apagar el control.')) cerrar();
  }

  async function generarRecuperacionNueva() {
    const resultado: { clave: string | null } = { clave: null };
    const ok = await ejecutar(async () => {
      resultado.clave = await usuarios.generarClaveRecuperacion();
    }, 'No se pudo generar la clave.');
    if (ok && resultado.clave) setFormulario({ tipo: 'mostrar_recuperacion', clave: resultado.clave });
  }

  // --- Pantallas -----------------------------------------------------------

  if (!esPremium) {
    return (
      <section className="mt-6 rounded-xl border border-linea p-5 text-center">
        <p className="text-sm font-semibold text-tinta">Administración de Usuarios es una función Premium</p>
        <p className="mt-2 text-xs text-tinta/60">Actívala desde el panel de administrador.</p>
        {controlActivo && lista.length > 0 && (
          <p className="mt-3 text-xs text-tinta/60">
            Tus usuarios están guardados. El control de usuarios está suspendido y la app abre sin pedir usuario hasta que
            vuelvas a tener Premium.
          </p>
        )}
      </section>
    );
  }

  // Recién creado el primer administrador: se muestra su clave de recuperación una sola vez.
  if (clavePrimera) {
    return (
      <div className="mt-6 space-y-4">
        <h2 className="text-lg font-extrabold text-bodega-oscuro">Administrador creado</h2>
        <MostrarClaveRecuperacion
          clave={clavePrimera.clave}
          textoBoton="Listo, continuar"
          onListo={() => {
            const creado = clavePrimera.usuario;
            setClavePrimera(null);
            setPuertaSuperada(true);
            recargar();
            // La persona que acaba de crear al administrador queda dentro, sin pedirle la contraseña otra vez.
            onSesionIniciada?.(creado);
            onControlCambiado?.();
          }}
        />
      </div>
    );
  }

  if (lista.length === 0) {
    return (
      <div className="mt-6 space-y-5">
        <p className="text-sm text-tinta/70">
          Con el control de usuarios, cada persona entra a Vende Fácil con su nombre y su contraseña, y tú decides qué
          puede hacer cada una.
        </p>
        <div className="rounded-xl border border-linea p-4 text-sm text-tinta/80">
          <p className="font-bold text-tinta">Usuario estándar puede:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {Array.from(PERMISOS_ESTANDAR).map((p) => (
              <li key={p}>{descripcionDePermiso(p)}</li>
            ))}
          </ul>
          <p className="mt-3 font-bold text-tinta">Administrador puede todo, y además:</p>
          <p className="mt-1">crear usuarios, cambiar contraseñas, anular, modificar, exportar y respaldar.</p>
        </div>
        <h2 className="text-base font-extrabold text-bodega-oscuro">Primero, crea al administrador</h2>
        <div className="space-y-4">
          <div>
            <EtiquetaCampo>Nombre de usuario:</EtiquetaCampo>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              aria-label="Nombre de usuario"
              maxLength={20}
              autoComplete="off"
              className="h-12 w-full rounded-xl border border-linea bg-white px-4 text-base outline-none focus:border-bodega"
            />
          </div>
          <div>
            <EtiquetaCampo>Contraseña:</EtiquetaCampo>
            <CampoClave valor={clave} onChange={setClave} etiquetaAccesible="Contraseña" placeholder={`Mínimo ${MINIMO_CARACTERES_CLAVE} caracteres`} />
          </div>
          <div>
            <EtiquetaCampo>Repite la contraseña:</EtiquetaCampo>
            <CampoClave valor={clave2} onChange={setClave2} etiquetaAccesible="Repite la contraseña" />
          </div>
          {error && (
            <p role="alert" className="text-sm font-semibold text-alerta">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={crearPrimerAdministrador}
            disabled={trabajando}
            className="h-12 w-full rounded-full bg-bodega text-base font-semibold text-white active:bg-bodega-oscuro disabled:opacity-40"
          >
            {trabajando ? 'Creando…' : 'Crear administrador y activar'}
          </button>
        </div>
      </div>
    );
  }

  // Con el control rigiendo y una persona dentro: un usuario estándar no administra usuarios.
  if (usuarioActual && usuarioActual.rol !== 'administrador') {
    return (
      <section className="mt-6 rounded-xl border border-linea p-5 text-center">
        <p className="text-sm font-semibold text-tinta">Solo un administrador puede administrar usuarios.</p>
        <p className="mt-2 text-xs text-tinta/60">Pídele a un administrador que lo haga, o que entre con su usuario.</p>
      </section>
    );
  }

  // Con el control encendido, se entra solo con la contraseña de un administrador
  // (si ya hay un administrador dentro de la app, se entra directo).
  const entraDirecto = puertaSuperada || usuarioActual?.rol === 'administrador';
  if (controlActivo && !entraDirecto) {
    return (
      <div className="mt-6">
        <PuertaAdministrador
          titulo="Entra como administrador"
          descripcion="Solo un administrador puede administrar usuarios."
          administradores={lista.filter((u) => u.rol === 'administrador' && u.activo)}
          verificar={(id, c) => usuarios.verificarAcceso(id, c, { soloAdministrador: true })}
          recuperar={(id, rec, nueva) => usuarios.restablecerConClaveRecuperacion(id, rec, nueva)}
          persistir={persistir}
          onAutorizado={() => {
            setPuertaSuperada(true);
            recargar();
          }}
        />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="flex items-center justify-between gap-4 rounded-xl border border-linea p-4">
        <div>
          <p className="text-sm font-semibold text-tinta">Control de usuarios</p>
          <p className="mt-0.5 text-xs text-tinta/60">
            {controlActivo
              ? 'Encendido: al abrir la app se pide usuario y contraseña.'
              : 'Apagado: la app abre sin pedir usuario y todos pueden hacer todo.'}
          </p>
        </div>
        <Interruptor activado={controlActivo} onChange={alternarControl} disabled={trabajando} />
      </section>
      {error && formulario === null && (
        <p role="alert" className="text-sm font-semibold text-alerta">
          {error}
        </p>
      )}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-tinta">Usuarios</h2>
          <button
            type="button"
            onClick={() => abrir({ tipo: 'nuevo' })}
            className="h-10 rounded-full border border-bodega px-4 text-sm font-semibold text-bodega-oscuro active:bg-bodega-claro"
          >
            ＋ Nuevo usuario
          </button>
        </div>
        <ul className="mt-2 divide-y divide-linea border-y border-linea">
          {lista.map((u) => (
            <FilaUsuario key={u.id} usuario={u} onClick={() => abrir({ tipo: 'editar', usuario: u })} />
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-linea p-4 text-sm text-tinta/80">
        <p className="font-bold text-tinta">Qué puede hacer cada rol</p>
        <p className="mt-2">
          <strong className="text-tinta">Administrador:</strong> todo (anular ventas, compras y pagos de fiado, modificar compras y clientes, caja,
          productos, configuración, respaldos, exportar y administrar usuarios).
        </p>
        <p className="mt-2">
          <strong className="text-tinta">Estándar:</strong> {Array.from(PERMISOS_ESTANDAR).map(descripcionDePermiso).join(', ')}.
        </p>
        <p className="mt-2 text-xs text-tinta/60">
          Un administrador también puede autorizar una acción puntual a un usuario estándar escribiendo su contraseña.
        </p>
      </section>

      <section className="rounded-xl border border-linea p-4">
        <p className="text-sm font-bold text-tinta">Clave de recuperación</p>
        <p className="mt-1 text-xs text-tinta/60">
          Sirve para poner una contraseña nueva si un administrador la olvida.{' '}
          {tieneRecuperacion ? 'Ya hay una clave creada.' : 'Todavía no hay una clave creada.'}
        </p>
        <button
          type="button"
          onClick={() => abrir({ tipo: 'nueva_recuperacion' })}
          className="mt-3 h-11 w-full rounded-xl border border-linea text-sm font-semibold text-tinta"
        >
          {tieneRecuperacion ? 'Generar una clave nueva' : 'Generar clave de recuperación'}
        </button>
      </section>

      {/* ---- Ventanas ---- */}
      {formulario?.tipo === 'nuevo' && (
        <VentanaFormulario titulo="Nuevo usuario" onCerrar={cerrar}>
          <div>
            <EtiquetaCampo>Nombre de usuario:</EtiquetaCampo>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              aria-label="Nombre de usuario"
              maxLength={20}
              autoComplete="off"
              className="h-12 w-full rounded-xl border border-linea bg-white px-4 text-base outline-none focus:border-bodega"
            />
          </div>
          <div>
            <EtiquetaCampo>Contraseña:</EtiquetaCampo>
            <CampoClave valor={clave} onChange={setClave} etiquetaAccesible="Contraseña" placeholder={`Mínimo ${MINIMO_CARACTERES_CLAVE} caracteres`} />
          </div>
          <div>
            <EtiquetaCampo>Repite la contraseña:</EtiquetaCampo>
            <CampoClave valor={clave2} onChange={setClave2} etiquetaAccesible="Repite la contraseña" />
          </div>
          <div>
            <EtiquetaCampo>Rol:</EtiquetaCampo>
            <SelectorDeRol valor={rol} onChange={setRol} />
          </div>
          {error && (
            <p role="alert" className="text-sm font-semibold text-alerta">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={cerrar} className="h-12 flex-1 rounded-full border border-linea text-sm font-semibold text-tinta">
              Cancelar
            </button>
            <button type="button" onClick={crearUsuario} disabled={trabajando} className="h-12 flex-1 rounded-full bg-bodega text-sm font-semibold text-white disabled:opacity-40">
              {trabajando ? 'Creando…' : 'Crear usuario'}
            </button>
          </div>
        </VentanaFormulario>
      )}

      {formulario?.tipo === 'editar' && (
        <VentanaFormulario titulo={`Usuario ${formulario.usuario.nombre}`} onCerrar={cerrar}>
          <div>
            <EtiquetaCampo>Nombre de usuario:</EtiquetaCampo>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              aria-label="Nombre de usuario"
              maxLength={20}
              autoComplete="off"
              className="h-12 w-full rounded-xl border border-linea bg-white px-4 text-base outline-none focus:border-bodega"
            />
          </div>
          <div>
            <EtiquetaCampo>Rol:</EtiquetaCampo>
            <SelectorDeRol valor={rol} onChange={setRol} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-tinta">Usuario activo</p>
              <p className="text-xs text-tinta/60">Si lo desactivas ya no puede entrar, pero se conserva su historial.</p>
            </div>
            <Interruptor activado={activo} onChange={() => setActivo((a) => !a)} />
          </div>
          {error && (
            <p role="alert" className="text-sm font-semibold text-alerta">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => guardarCambios(formulario.usuario)}
            disabled={trabajando}
            className="h-12 w-full rounded-full bg-bodega text-sm font-semibold text-white disabled:opacity-40"
          >
            {trabajando ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button
            type="button"
            onClick={() => abrir({ tipo: 'clave', usuario: formulario.usuario })}
            className="h-11 w-full rounded-xl border border-linea text-sm font-semibold text-tinta"
          >
            Cambiar contraseña
          </button>
          <button type="button" onClick={cerrar} className="h-10 w-full text-sm font-semibold text-tinta/60">
            Cancelar
          </button>
        </VentanaFormulario>
      )}

      {formulario?.tipo === 'clave' && (
        <VentanaFormulario titulo={`Contraseña de ${formulario.usuario.nombre}`} onCerrar={cerrar}>
          <div>
            <EtiquetaCampo>Contraseña nueva:</EtiquetaCampo>
            <CampoClave valor={clave} onChange={setClave} etiquetaAccesible="Contraseña nueva" placeholder={`Mínimo ${MINIMO_CARACTERES_CLAVE} caracteres`} />
          </div>
          <div>
            <EtiquetaCampo>Repite la contraseña nueva:</EtiquetaCampo>
            <CampoClave valor={clave2} onChange={setClave2} etiquetaAccesible="Repite la contraseña nueva" />
          </div>
          <p className="text-xs text-tinta/60">Si estaba bloqueado por intentos fallidos, se desbloquea.</p>
          {error && (
            <p role="alert" className="text-sm font-semibold text-alerta">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={cerrar} className="h-12 flex-1 rounded-full border border-linea text-sm font-semibold text-tinta">
              Cancelar
            </button>
            <button type="button" onClick={() => cambiarClave(formulario.usuario)} disabled={trabajando} className="h-12 flex-1 rounded-full bg-bodega text-sm font-semibold text-white disabled:opacity-40">
              {trabajando ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
          </div>
        </VentanaFormulario>
      )}

      {formulario?.tipo === 'activar' && (
        <VentanaFormulario titulo="Confirma que eres administrador" onCerrar={cerrar}>
          <PuertaAdministrador
            titulo="Encender el control de usuarios"
            descripcion="Escribe la contraseña de un administrador. Desde entonces, al abrir la app se pedirá usuario y contraseña."
            administradores={lista.filter((u) => u.rol === 'administrador' && u.activo)}
            verificar={(id, c) => usuarios.verificarAcceso(id, c, { soloAdministrador: true })}
            recuperar={(id, rec, nueva) => usuarios.restablecerConClaveRecuperacion(id, rec, nueva)}
            persistir={persistir}
            textoBoton="Encender"
            onAutorizado={activarControl}
            onCancelar={cerrar}
          />
        </VentanaFormulario>
      )}

      {formulario?.tipo === 'apagar' && (
        <VentanaFormulario titulo="¿Apagar el control de usuarios?" onCerrar={cerrar}>
          <p className="text-sm text-tinta/70">
            La app volverá a abrir sin pedir usuario y todos podrán hacer todo. Tus usuarios se conservan: al volver a
            encenderlo siguen ahí.
          </p>
          {error && (
            <p role="alert" className="text-sm font-semibold text-alerta">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={cerrar} className="h-12 flex-1 rounded-full border border-linea text-sm font-semibold text-tinta">
              Cancelar
            </button>
            <button type="button" onClick={apagarControl} disabled={trabajando} className="h-12 flex-1 rounded-full bg-alerta text-sm font-semibold text-white disabled:opacity-40">
              Sí, apagar
            </button>
          </div>
        </VentanaFormulario>
      )}

      {formulario?.tipo === 'nueva_recuperacion' && (
        <VentanaFormulario titulo="Nueva clave de recuperación" onCerrar={cerrar}>
          <p className="text-sm text-tinta/70">
            {tieneRecuperacion
              ? 'La clave anterior dejará de servir. Se mostrará la nueva una sola vez, para que la anotes.'
              : 'Se mostrará una sola vez, para que la anotes.'}
          </p>
          {error && (
            <p role="alert" className="text-sm font-semibold text-alerta">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={cerrar} className="h-12 flex-1 rounded-full border border-linea text-sm font-semibold text-tinta">
              Cancelar
            </button>
            <button type="button" onClick={generarRecuperacionNueva} disabled={trabajando} className="h-12 flex-1 rounded-full bg-bodega text-sm font-semibold text-white disabled:opacity-40">
              Generar
            </button>
          </div>
        </VentanaFormulario>
      )}

      {formulario?.tipo === 'mostrar_recuperacion' && (
        // Sin ✕: no se puede cerrar sin marcar que ya se anotó, porque esta clave no se vuelve a mostrar.
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div role="dialog" aria-label="Anotar la clave de recuperación" className="max-h-[88dvh] w-full max-w-app overflow-y-auto rounded-2xl bg-white p-5 shadow-lg">
            <h2 className="mb-4 text-base font-extrabold text-bodega-oscuro">Clave de recuperación</h2>
            <MostrarClaveRecuperacion clave={formulario.clave} textoBoton="Listo" onListo={cerrar} />
          </div>
        </div>
      )}
    </div>
  );
}
