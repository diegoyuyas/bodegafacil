/**
 * Prueba del control de usuarios (Etapa 1: base). Con una base real (sql.js).
 * Cubre: nombres y contraseñas, usuarios y roles, varios administradores, el bloqueo por
 * intentos fallidos (con reloj simulado), la autorización puntual, la clave de recuperación,
 * el interruptor (y que se suspenda sin Premium) y la matriz de permisos.
 *
 * Uso: npx tsx scripts/probar-usuarios.ts
 */
import path from 'node:path';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { ConfiguracionRepositorioSqlite } from '../src/infraestructura/sqlite/configuracion.repositorio';
import { UsuarioRepositorioSqlite } from '../src/infraestructura/sqlite/usuario.repositorio';
import {
  debeBloquearPorSegundoPlano,
  indiceDeColorDeUsuario,
  inicialDeUsuario,
  mensajeDeAccesoFallido,
  segundosDeBloqueo,
  validarClave,
  validarNombreUsuario,
} from '../src/core/usuarios';
import {
  PERMISOS_ESTANDAR,
  categoriaPinDe,
  descripcionDePermiso,
  esAutorizablePuntualmente,
  mensajeSoloAdministrador,
  puedeHacer,
  type Permiso,
} from '../src/core/permisos';
import { controlUsuariosVigente } from '../src/core/configuracion';
import { claveCoincide, generarClaveRecuperacion, normalizarClaveRecuperacion, protegerClave } from '../src/infraestructura/seguridad/clave-usuario';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

async function lanza(fn: () => unknown): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const localizarArchivo = () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

async function main() {
  // ---------- Reglas puras: nombre ----------
  afirmar(validarNombreUsuario('  diego  ') === 'Diego', 'El nombre se limpia y la primera letra queda en mayúscula («diego» → «Diego»)');
  afirmar(validarNombreUsuario('María José') === 'María José' && validarNombreUsuario('ana.p_2') === 'Ana.p_2', 'Acepta tildes, espacios, punto y guion bajo entre palabras');
  for (const malo of ['a', 'x'.repeat(21), 'di$ego', ' ', 'diego!', '_diego']) {
    afirmar((await lanza(() => validarNombreUsuario(malo))) !== null, `Rechaza el nombre «${malo}»`);
  }
  afirmar(inicialDeUsuario('diego') === 'D' && inicialDeUsuario('édgar') === 'É', 'La letra grande del recuadro es la inicial en mayúscula');
  afirmar(
    indiceDeColorDeUsuario('Diego', 8) === indiceDeColorDeUsuario('DIEGO', 8) && indiceDeColorDeUsuario('Diego', 8) < 8,
    'Cada usuario tiene siempre el mismo color',
  );

  // ---------- Reglas puras: contraseña ----------
  for (const buena of ['abcd', '1234', 'Ab12', 'clave.2024', 'p#ss*word$_&', 'mañana,1', 'A'.repeat(32)]) {
    validarClave(buena);
  }
  console.log('✅ Acepta contraseñas de 4+ caracteres con letras, números y signos (. , # * $ _ &)');
  for (const mala of ['abc', 'ab cd', ' abcd', 'A'.repeat(33), 'ab\tcd', '']) {
    afirmar((await lanza(() => validarClave(mala))) !== null, `Rechaza la contraseña «${mala.length > 10 ? mala.slice(0, 6) + '…' : mala}»`);
  }

  // ---------- Huella de la contraseña ----------
  const huellaA = await protegerClave('secreta.1');
  const huellaB = await protegerClave('secreta.1');
  afirmar(!huellaA.hash.includes('secreta') && huellaA.hash.length === 64, 'Se guarda una huella, nunca la contraseña');
  afirmar(huellaA.hash !== huellaB.hash && huellaA.sal !== huellaB.sal, 'La misma contraseña da huellas distintas en cada usuario (sal propia)');
  afirmar((await claveCoincide('secreta.1', huellaA)) && !(await claveCoincide('secreta.2', huellaA)), 'Reconoce la contraseña correcta y rechaza la incorrecta');
  const rec = generarClaveRecuperacion();
  afirmar(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){2}$/.test(rec), `La clave de recuperación tiene formato XXXX-XXXX-XXXX (${rec})`);
  afirmar(normalizarClaveRecuperacion(' abcd efgh-jkmn ') === 'ABCDEFGHJKMN', 'La clave de recuperación se puede escribir con minúsculas, espacios o guiones');

  // ---------- Bloqueo (reglas puras) ----------
  afirmar(
    [1, 4, 5, 6, 10, 15, 20, 25, 30, 50].map(segundosDeBloqueo).join(',') === '0,0,30,0,60,120,240,300,300,300',
    'El bloqueo: 5 fallos = 30 s; luego 60, 120, 240 y como máximo 5 minutos',
  );

  // ---------- Re-bloqueo por segundo plano ----------
  afirmar(
    !debeBloquearPorSegundoPlano(4 * 60_000) && debeBloquearPorSegundoPlano(5 * 60_000) && debeBloquearPorSegundoPlano(6 * 60_000),
    'Vuelve a pedir acceso desde los 5 minutos en segundo plano (a los 4 minutos no)',
  );
  afirmar(debeBloquearPorSegundoPlano(-1), 'Si el reloj retrocedió, por seguridad pide acceso');
  afirmar(!debeBloquearPorSegundoPlano(2 * 60_000, 3) && debeBloquearPorSegundoPlano(3 * 60_000, 3), 'El tiempo de re-bloqueo se puede cambiar');

  // ---------- Con base real ----------
  let ahora = 1_700_000_000_000;
  const bd = await BaseDatosLocal.crear({ localizarArchivo });
  const configuracion = new ConfiguracionRepositorioSqlite(bd);
  const usuarios = new UsuarioRepositorioSqlite(bd, configuracion, () => ahora);

  afirmar(!usuarios.hayUsuarios() && !usuarios.controlActivadoEnConfiguracion(), 'Instalación nueva: sin usuarios y sin control (la app entra normal)');
  afirmar((await lanza(() => usuarios.activarControl())) !== null, 'No se puede activar el control sin un administrador');

  // Asistente de la primera vez.
  const primero = await usuarios.crearPrimerAdministrador({ nombre: 'diego', clave: 'Admin.2024' });
  afirmar(primero.usuario.rol === 'administrador' && primero.usuario.nombre === 'Diego', 'El asistente crea al primer usuario como administrador');
  afirmar(usuarios.controlActivadoEnConfiguracion(), 'El asistente enciende el control de usuarios');
  afirmar(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){2}$/.test(primero.claveRecuperacion) && usuarios.tieneClaveRecuperacion(), 'El asistente entrega la clave de recuperación (una sola vez)');
  afirmar((await lanza(() => usuarios.crearPrimerAdministrador({ nombre: 'otro', clave: 'abcd' }))) !== null, 'El asistente solo sirve la primera vez');

  const guardado = bd.consultar<{ clave_hash: string; clave_sal: string }>('SELECT clave_hash, clave_sal FROM usuario')[0];
  afirmar(!!guardado && !JSON.stringify(guardado).includes('Admin.2024'), 'En la base no aparece la contraseña, solo su huella');
  const claveRecGuardada = configuracion.obtenerValor('usuarios_recuperacion') ?? '';
  afirmar(!claveRecGuardada.includes(primero.claveRecuperacion.replace(/-/g, '')), 'Tampoco se guarda la clave de recuperación, solo su huella');

  // Varios usuarios y varios administradores.
  const maria = await usuarios.crear({ nombre: 'María', clave: 'maria#1', rol: 'administrador' });
  const luis = await usuarios.crear({ nombre: 'luis', clave: '1234', rol: 'estandar' });
  const ana = await usuarios.crear({ nombre: 'Ana', clave: 'ana_2024', rol: 'estandar' });
  afirmar(usuarios.listarAdministradoresActivos().length === 2, 'Puede haber varios administradores (Diego y María)');
  afirmar(usuarios.listarTodos().map((u) => u.nombre).join(',') === 'Diego,María,Ana,Luis', 'Los recuadros salen con los administradores primero y luego por nombre');
  afirmar((await lanza(() => usuarios.crear({ nombre: 'MARIA', clave: 'otra1', rol: 'estandar' }))) !== null, 'No permite repetir un nombre (ni con otras mayúsculas ni sin tilde)');
  afirmar((await lanza(() => usuarios.crear({ nombre: 'Pedro', clave: 'ab', rol: 'estandar' }))) !== null, 'No crea un usuario con contraseña inválida');
  afirmar(usuarios.listarTodos().length === 4, 'Los intentos rechazados no dejan usuarios a medias');

  // Acceso.
  const entra = await usuarios.verificarAcceso(luis.id, '1234');
  afirmar(entra.ok && entra.usuario.nombre === 'Luis' && usuarios.obtenerPorId(luis.id).ultimoAcceso !== null, 'Acceso con la contraseña correcta (y queda el último acceso)');
  const falla = await usuarios.verificarAcceso(luis.id, 'mala');
  afirmar(!falla.ok && falla.motivo === 'clave_incorrecta' && falla.intentosRestantes === 4, 'Con contraseña mala avisa cuántos intentos quedan (4)');
  afirmar(!falla.ok && mensajeDeAccesoFallido(falla).includes('4 intentos'), `Mensaje: «${!falla.ok ? mensajeDeAccesoFallido(falla) : ''}»`);

  // Bloqueo con reloj simulado (ya lleva 1 fallo; 4 más = 5).
  for (let i = 0; i < 3; i++) await usuarios.verificarAcceso(luis.id, 'mala');
  const quinto = await usuarios.verificarAcceso(luis.id, 'mala');
  afirmar(!quinto.ok && quinto.motivo === 'bloqueado' && quinto.segundosEspera === 30, 'Tras 5 intentos fallidos se bloquea 30 segundos');
  const duranteBloqueo = await usuarios.verificarAcceso(luis.id, '1234');
  afirmar(!duranteBloqueo.ok && duranteBloqueo.motivo === 'bloqueado', 'Durante el bloqueo ni la contraseña correcta entra');
  ahora += 31_000;
  const despues = await usuarios.verificarAcceso(luis.id, '1234');
  afirmar(despues.ok, 'Pasados los 30 segundos vuelve a poder entrar');
  afirmar(bd.consultar<{ intentos_fallidos: number }>('SELECT intentos_fallidos FROM usuario WHERE id = ?', [luis.id])[0]?.intentos_fallidos === 0, 'Un acceso correcto reinicia el conteo de fallos');

  // El bloqueo sobrevive a cerrar y abrir la app (está en la base, no en memoria).
  for (let i = 0; i < 5; i++) await usuarios.verificarAcceso(ana.id, 'mala');
  const bdReabierta = await BaseDatosLocal.crear({ localizarArchivo, datosPrevios: bd.exportar() });
  const usuariosReabierto = new UsuarioRepositorioSqlite(bdReabierta, new ConfiguracionRepositorioSqlite(bdReabierta), () => ahora);
  const trasReabrir = await usuariosReabierto.verificarAcceso(ana.id, 'ana_2024');
  afirmar(!trasReabrir.ok && trasReabierto(trasReabrir), 'Cerrar y abrir la app no quita el bloqueo');
  function trasReabierto(r: { motivo: string }) {
    return r.motivo === 'bloqueado';
  }
  ahora += 31_000;

  // Autorización puntual del administrador.
  const autorizada = await usuarios.autorizarComoAdministrador(maria.id, 'maria#1');
  afirmar(autorizada.ok, 'Un administrador autoriza una acción escribiendo su contraseña');
  const noAdmin = await usuarios.autorizarComoAdministrador(luis.id, '1234');
  afirmar(!noAdmin.ok && noAdmin.motivo === 'no_es_administrador', 'Un usuario estándar NO puede autorizar, aunque sepa su propia contraseña');
  const adminMal = await usuarios.autorizarComoAdministrador(maria.id, 'mala');
  afirmar(!adminMal.ok && adminMal.motivo === 'clave_incorrecta', 'La autorización con contraseña mala se rechaza (y también cuenta intentos)');

  // Cambiar contraseñas.
  await usuarios.cambiarClave(luis.id, 'nueva.1');
  afirmar(!(await usuarios.verificarAcceso(luis.id, '1234')).ok && (await usuarios.verificarAcceso(luis.id, 'nueva.1')).ok, 'El administrador cambia la contraseña de otro usuario');
  const propia = await usuarios.cambiarClavePropia(luis.id, 'mal', 'otra.2');
  afirmar(!propia.ok, 'Cambiar la contraseña propia exige la actual');
  afirmar((await usuarios.cambiarClavePropia(luis.id, 'nueva.1', 'otra.2')).ok && (await usuarios.verificarAcceso(luis.id, 'otra.2')).ok, 'Con la actual correcta, la cambia');
  afirmar((await lanza(() => usuarios.cambiarClave(luis.id, 'ab'))) !== null, 'No acepta una contraseña nueva inválida');

  // Roles y desactivación.
  usuarios.actualizar(luis.id, { rol: 'administrador' });
  afirmar(usuarios.listarAdministradoresActivos().length === 3, 'Se puede hacer administrador a otro usuario');
  usuarios.actualizar(luis.id, { rol: 'estandar' });
  usuarios.actualizar(ana.id, { activo: false });
  afirmar(usuarios.listarActivos().length === 3 && usuarios.listarTodos().length === 4, 'Un usuario desactivado ya no sale en el acceso, pero se conserva');
  const inactivo = await usuarios.verificarAcceso(ana.id, 'ana_2024');
  afirmar(!inactivo.ok && inactivo.motivo === 'inactivo', 'Un usuario desactivado no puede entrar');
  usuarios.actualizar(ana.id, { activo: true });
  afirmar((await usuarios.verificarAcceso(ana.id, 'ana_2024')).ok, 'Al reactivarlo vuelve a entrar y se le quita el bloqueo');
  afirmar(usuarios.actualizar(luis.id, { nombre: 'Luis Carlos' }).nombre === 'Luis Carlos', 'Se puede cambiar el nombre de un usuario');
  afirmar((await lanza(() => usuarios.actualizar(luis.id, { nombre: 'ANA' }))) !== null, 'Cambiar el nombre tampoco permite repetir otro');

  // Siempre queda un administrador.
  usuarios.actualizar(maria.id, { activo: false });
  afirmar((await lanza(() => usuarios.actualizar(primero.usuario.id, { rol: 'estandar' }))) !== null, 'No se puede quitar el rol al ÚLTIMO administrador activo');
  afirmar((await lanza(() => usuarios.actualizar(primero.usuario.id, { activo: false }))) !== null, 'No se puede desactivar al ÚLTIMO administrador activo');
  usuarios.actualizar(maria.id, { activo: true });
  usuarios.actualizar(primero.usuario.id, { rol: 'estandar' });
  afirmar(usuarios.listarAdministradoresActivos().length === 1, 'Con otro administrador activo, sí se puede dejar de serlo');
  usuarios.actualizar(primero.usuario.id, { rol: 'administrador' });

  // Clave de recuperación.
  const mal = await usuarios.restablecerConClaveRecuperacion(primero.usuario.id, 'AAAA-BBBB-CCCC', 'nueva.clave');
  afirmar(!mal.ok, 'Una clave de recuperación equivocada no sirve');
  const noAdminRec = await usuarios.restablecerConClaveRecuperacion(luis.id, primero.claveRecuperacion, 'nueva.clave');
  afirmar(!noAdminRec.ok, 'La clave de recuperación solo sirve para un administrador');
  afirmar((await lanza(() => usuarios.restablecerConClaveRecuperacion(primero.usuario.id, primero.claveRecuperacion, 'ab'))) !== null, 'No gasta la clave de recuperación si la contraseña nueva es inválida');
  const bien = await usuarios.restablecerConClaveRecuperacion(primero.usuario.id, primero.claveRecuperacion.toLowerCase().replace(/-/g, ' '), 'recuperada.1');
  afirmar(bien.ok && (await usuarios.verificarAcceso(primero.usuario.id, 'recuperada.1')).ok, 'Con la clave de recuperación (escrita a mano) se pone una contraseña nueva');
  afirmar(bien.ok && bien.nuevaClaveRecuperacion !== primero.claveRecuperacion, 'Se entrega una clave de recuperación nueva');
  const reuso = await usuarios.restablecerConClaveRecuperacion(primero.usuario.id, primero.claveRecuperacion, 'otra.vez.1');
  afirmar(!reuso.ok, 'La clave de recuperación ya usada deja de servir');

  // Interruptor general y Premium.
  usuarios.desactivarControl();
  afirmar(!usuarios.controlActivadoEnConfiguracion() && usuarios.listarTodos().length === 4, 'Apagar el control no borra a ningún usuario');
  usuarios.activarControl();
  afirmar(controlUsuariosVigente('1', true) === true, 'Control en ON + Premium = rige');
  afirmar(controlUsuariosVigente('1', false) === false, 'Control en ON pero sin Premium = se suspende (la app entra normal)');
  afirmar(controlUsuariosVigente(null, true) === false && controlUsuariosVigente('0', true) === false, 'Control apagado = no rige');

  // ---------- Permisos ----------
  const estandar: Permiso[] = ['crear_venta', 'crear_cliente', 'ver_reportes', 'registrar_pago_fiado', 'reimprimir'];
  afirmar(estandar.every((p) => puedeHacer('estandar', p)) && PERMISOS_ESTANDAR.size === 5, 'El usuario estándar puede: pedidos, crear clientes, ver reportes, cobrar fiados y reimprimir');
  const soloAdmin: Permiso[] = [
    'anular_venta', 'anular_compra', 'modificar_compra', 'registrar_compra', 'movimiento_caja', 'anular_pago_fiado', 'modificar_cliente',
    'gestionar_productos', 'gestionar_proveedores', 'importar_datos', 'exportar', 'respaldo', 'configuracion', 'administrar_usuarios',
  ];
  afirmar(soloAdmin.every((p) => !puedeHacer('estandar', p) && puedeHacer('administrador', p)), 'Solo el administrador: anular, modificar compras/clientes, caja, productos, exportar, respaldo, configuración y usuarios');
  afirmar(esAutorizablePuntualmente('anular_venta') && esAutorizablePuntualmente('movimiento_caja'), 'Una anulación o un movimiento de caja se puede autorizar con la contraseña de un administrador');
  afirmar(!esAutorizablePuntualmente('exportar') && !esAutorizablePuntualmente('respaldo') && !esAutorizablePuntualmente('administrar_usuarios') && !esAutorizablePuntualmente('configuracion'), 'Exportar, respaldos, configuración y usuarios NO se pueden autorizar así');
  afirmar(
    (['anular_venta', 'anular_compra', 'anular_pago_fiado'] as Permiso[]).every((p) => categoriaPinDe(p) === 'anular') &&
      (['modificar_compra', 'movimiento_caja', 'modificar_cliente', 'gestionar_productos', 'gestionar_proveedores', 'registrar_pago_fiado', 'importar_datos'] as Permiso[]).every(
        (p) => categoriaPinDe(p) === 'modificar',
      ),
    'Sin control de usuarios, cada acción pide el mismo PIN de siempre («anular» o «modificar»)',
  );
  afirmar(mensajeSoloAdministrador('anular_venta') === 'Solo un administrador puede anular ventas.' && descripcionDePermiso('exportar') === 'exportar datos', 'Los mensajes de «solo administrador» son claros');

  console.log('\n🎉 La base del control de usuarios funciona.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
