/**
 * Prueba de la trazabilidad del control de usuarios (Etapa 5), con una base real:
 * cada venta, compra, cobro y movimiento de caja guarda QUIÉN lo hizo; las acciones delicadas
 * quedan en la actividad con quién las hizo y, si hizo falta, quién las autorizó.
 *
 * Uso: npx tsx scripts/probar-actividad.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { ConfiguracionRepositorioSqlite } from '../src/infraestructura/sqlite/configuracion.repositorio';
import { ProductoRepositorioSqlite } from '../src/infraestructura/sqlite/producto.repositorio';
import { ClienteRepositorioSqlite } from '../src/infraestructura/sqlite/cliente.repositorio';
import { CajaRepositorioSqlite } from '../src/infraestructura/sqlite/caja.repositorio';
import { VentaRepositorioSqlite } from '../src/infraestructura/sqlite/venta.repositorio';
import { FiadoRepositorioSqlite } from '../src/infraestructura/sqlite/fiado.repositorio';
import { ProveedorRepositorioSqlite } from '../src/infraestructura/sqlite/proveedor.repositorio';
import { CompraRepositorioSqlite } from '../src/infraestructura/sqlite/compra.repositorio';
import { UsuarioRepositorioSqlite } from '../src/infraestructura/sqlite/usuario.repositorio';
import { ActividadUsuarioRepositorioSqlite } from '../src/infraestructura/sqlite/actividad-usuario.repositorio';
import { ContextoActor } from '../src/infraestructura/sqlite/contexto-actor';
import { textoDeActividad } from '../src/core/actividad';
import { hoyLocalSql, sumarDiasLocalSql } from '../src/core/tiempo';
import {
  ENCABEZADOS_AUDITORIA,
  construirHojaCaja,
  construirHojaCompras,
  construirHojaComprasDetallado,
  construirHojaVentas,
} from '../src/core/exportacion';
import * as XLSX from 'xlsx';
import { generarLibroExcel } from '../src/infraestructura/exportacion/excel';
import { construirTextoComprobante } from '../src/core/comprobante-impresion';
import { construirDatosComprobanteDeVenta } from '../src/infraestructura/comprobante/datos-comprobante';
import { CLAVE_TIENDA_VENDEDOR } from '../src/core/informacion-tienda';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

async function main() {
  const bd = await BaseDatosLocal.crear({
    localizarArchivo: () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  });

  // Mismo armado que en contenedor.ts (abajo se comprueba que el contenedor real lo hace igual).
  let reloj = Date.now();
  const actor = new ContextoActor(() => reloj);
  const actividad = new ActividadUsuarioRepositorioSqlite(bd, actor);
  const configuracion = new ConfiguracionRepositorioSqlite(bd);
  const productos = new ProductoRepositorioSqlite(bd, actividad);
  const clientes = new ClienteRepositorioSqlite(bd, configuracion, actividad);
  const caja = new CajaRepositorioSqlite(bd, actividad);
  const ventas = new VentaRepositorioSqlite(bd, productos, caja, configuracion, actividad);
  const fiados = new FiadoRepositorioSqlite(bd, caja, actividad);
  const proveedores = new ProveedorRepositorioSqlite(bd, actividad);
  const compras = new CompraRepositorioSqlite(bd, productos, caja, actividad);
  const usuarios = new UsuarioRepositorioSqlite(bd, configuracion, undefined, actividad);

  const fila = <T>(sql: string, params: unknown[] = []) => bd.consultar<T>(sql, params)[0] as T;
  const cuantasActividades = () => fila<{ n: number }>('SELECT COUNT(*) AS n FROM actividad_usuario').n;
  const hoy = hoyLocalSql();

  const { usuario: diego } = await usuarios.crearPrimerAdministrador({ nombre: 'diego', clave: 'Admin.2024' });
  const luis = await usuarios.crear({ nombre: 'luis', clave: '1234', rol: 'estandar' });
  const maria = await usuarios.crear({ nombre: 'maria', clave: 'maria#1', rol: 'administrador' });
  afirmar(cuantasActividades() === 0, 'Crear el primer administrador (cuando aún no rige el control) no registra actividad');

  const base = { costo: 2, stockActual: 50, stockMinimo: 1, controlaStock: true, unidadMedida: 'unidad' };

  // ---------- 1. SIN control de usuarios: todo igual que siempre, sin registrar nada ----------
  actor.establecerUsuario(null);
  const gaseosa = productos.crear({ ...base, nombre: 'Gaseosa', precioVenta: 4 });
  const ventaSin = ventas.registrarVenta({ lineas: [{ productoId: gaseosa.id, cantidad: 1 }], metodoPago: 'efectivo' });
  ventas.anularVenta(ventaSin.id, 'prueba');
  caja.registrarIngreso(10, 'Ajuste', 'efectivo');
  afirmar(ventaSin.usuarioId === null && cuantasActividades() === 0, 'Sin control de usuarios: la venta no tiene usuario y no se registra actividad');
  afirmar(fila<{ usuario_id: number | null }>('SELECT usuario_id FROM movimiento_caja ORDER BY id LIMIT 1').usuario_id === null, 'Sin control de usuarios: los movimientos de caja tampoco guardan usuario');

  // ---------- 2. Un usuario estándar vende ----------
  actor.establecerUsuario(luis.id);
  const venta1 = ventas.registrarVenta({ lineas: [{ productoId: gaseosa.id, cantidad: 2 }], metodoPago: 'efectivo' });
  afirmar(venta1.usuarioId === luis.id, 'La venta guarda quién la registró (Luis)');
  afirmar(fila<{ usuario_id: number }>('SELECT usuario_id FROM movimiento_caja WHERE venta_id = ?', [venta1.id]).usuario_id === luis.id, 'El ingreso de caja de esa venta también guarda a Luis');
  afirmar(ventas.listarDeHoyConDetalle().find((v) => v.id === venta1.id)?.usuarioNombre === 'Luis', 'La lista de ventas de Inicio muestra «Luis»');
  afirmar(caja.listarMovimientosDeHoy().find((m) => m.ventaId === venta1.id)?.usuarioNombre === 'Luis', 'La lista de Caja muestra «Luis»');
  afirmar(ventas.listarDeHoyConDetalle().find((v) => v.id === ventaSin.id)?.usuarioNombre === null, 'Las ventas hechas sin control muestran sin usuario (no inventa uno)');
  afirmar(cuantasActividades() === 0, 'Una venta normal NO llena la bitácora de acciones delicadas');

  // Fiado y cobro
  const rosa = clientes.crear('Doña Rosa', '123456789101234', '987654321');
  const ventaFiada = ventas.registrarVenta({ lineas: [{ productoId: gaseosa.id, cantidad: 2 }], metodoPago: 'fiado', clienteId: rosa.id });
  fiados.registrarPago(rosa.id, 5, 'efectivo');
  afirmar(fila<{ usuario_id: number }>('SELECT usuario_id FROM pago_deuda ORDER BY id LIMIT 1').usuario_id === luis.id, 'El cobro de fiado guarda quién cobró');
  afirmar(ventaFiada.usuarioId === luis.id, 'La venta al fiado guarda a Luis');

  // ---------- 3. Luis anula una venta con autorización de Diego ----------
  actor.registrarAutorizacion('anular_venta', diego.id);
  ventas.anularVenta(venta1.id, 'se equivocó');
  const anulacion = actividad.listar({ desde: hoy, hasta: hoy })[0]!;
  afirmar(anulacion.accion === 'venta_anulada' && anulacion.usuarioNombre === 'Luis' && anulacion.autorizadoPorNombre === 'Diego', 'La anulación queda: lo hizo Luis, lo autorizó Diego');
  afirmar(textoDeActividad(anulacion) === `anuló la venta V-${venta1.id}`, `Se lee así: «Luis ${textoDeActividad(anulacion)}»`);
  const venta2 = ventas.registrarVenta({ lineas: [{ productoId: gaseosa.id, cantidad: 1 }], metodoPago: 'yape' });
  ventas.anularVenta(venta2.id, 'otra');
  afirmar(actividad.listar({ desde: hoy, hasta: hoy })[0]!.autorizadoPorNombre === null, 'Una autorización sirve UNA sola vez: la siguiente anulación ya no la lleva');

  // Autorización de otro permiso, o vencida, no se pega a esta acción
  const venta3 = ventas.registrarVenta({ lineas: [{ productoId: gaseosa.id, cantidad: 1 }], metodoPago: 'efectivo' });
  actor.registrarAutorizacion('movimiento_caja', diego.id);
  ventas.anularVenta(venta3.id);
  afirmar(actividad.listar({ desde: hoy, hasta: hoy })[0]!.autorizadoPorNombre === null, 'Una autorización de OTRO permiso no se atribuye a esta anulación');
  const venta4 = ventas.registrarVenta({ lineas: [{ productoId: gaseosa.id, cantidad: 1 }], metodoPago: 'efectivo' });
  actor.registrarAutorizacion('anular_venta', diego.id);
  reloj += 3 * 60_000;
  ventas.anularVenta(venta4.id);
  afirmar(actividad.listar({ desde: hoy, hasta: hoy })[0]!.autorizadoPorNombre === null, 'Una autorización vencida (más de 2 minutos) no se atribuye');
  const venta5 = ventas.registrarVenta({ lineas: [{ productoId: gaseosa.id, cantidad: 1 }], metodoPago: 'efectivo' });
  actor.registrarAutorizacion('anular_venta', diego.id);
  actor.establecerUsuario(maria.id);
  actor.establecerUsuario(luis.id);
  ventas.anularVenta(venta5.id);
  afirmar(actividad.listar({ desde: hoy, hasta: hoy })[0]!.autorizadoPorNombre === null, 'Cambiar de usuario descarta una autorización pendiente');

  // ---------- 4. Caja manual ----------
  actor.registrarAutorizacion('movimiento_caja', maria.id);
  caja.registrarEgreso(20, 'Retiro para el banco', 'efectivo');
  const egreso = actividad.listar({ desde: hoy, hasta: hoy })[0]!;
  afirmar(egreso.accion === 'caja_egreso' && egreso.autorizadoPorNombre === 'Maria' && (egreso.detalle ?? '').includes('Retiro para el banco (20.00)'), 'Un egreso manual de caja queda con quién lo hizo, el concepto y el monto, y quién lo autorizó');
  const antes = cuantasActividades();
  ventas.registrarVenta({ lineas: [{ productoId: gaseosa.id, cantidad: 1 }], metodoPago: 'efectivo' });
  afirmar(cuantasActividades() === antes, 'Los movimientos de caja AUTOMÁTICOS (de una venta) no se repiten en la actividad');

  // ---------- 5. Compras ----------
  actor.establecerUsuario(maria.id);
  const proveedor = proveedores.crear('Distribuidora Central', '999111222');
  const compra = compras.registrarCompra({ proveedorId: proveedor.id, metodoPago: 'efectivo', lineas: [{ productoId: gaseosa.id, cantidad: 5, costoUnitario: 3 }] });
  afirmar(fila<{ usuario_id: number }>('SELECT usuario_id FROM compra WHERE id = ?', [compra.id]).usuario_id === maria.id, 'La compra guarda quién la registró (María)');
  compras.modificarCompra(compra.id, { proveedorId: proveedor.id, comprobante: 'F001-1', metodoPago: 'efectivo', lineas: [{ productoId: gaseosa.id, cantidad: 5, costoUnitario: 3 }] });
  compras.modificarCompra(compra.id, { proveedorId: proveedor.id, comprobante: 'F001-1', metodoPago: 'yape', lineas: [{ productoId: gaseosa.id, cantidad: 6, costoUnitario: 3 }] });
  compras.anularCompra(compra.id, 'error');
  const accionesCompra = actividad.listar({ desde: hoy, hasta: hoy }).filter((a) => a.entidad === 'compra').map((a) => a.accion).reverse();
  afirmar(accionesCompra.join() === 'compra_registrada,compra_modificada,compra_modificada,compra_anulada', `La compra deja registrada su historia completa (${accionesCompra.join(' → ')})`);

  // ---------- 6. Pago de fiado anulado, clientes, proveedores, productos ----------
  actor.establecerUsuario(luis.id);
  const claveAbono = fiados.listarPagosDeCliente(rosa.id)[0]!.clave;
  actor.registrarAutorizacion('anular_pago_fiado', diego.id);
  fiados.anularPago(rosa.id, claveAbono, 'se equivocó');
  const anuloPago = actividad.listar({ desde: hoy, hasta: hoy })[0]!;
  afirmar(anuloPago.accion === 'pago_fiado_anulado' && anuloPago.autorizadoPorNombre === 'Diego' && textoDeActividad(anuloPago) === 'anuló un pago de fiado de Doña Rosa', `Anular un pago de fiado: «${textoDeActividad(anuloPago)}», autorizado por Diego`);
  clientes.actualizar(rosa.id, { nombre: 'Doña Rosa M.', documento: '123456789101234', telefono: '987654321', activo: true });
  afirmar(actividad.listar({ desde: hoy, hasta: hoy })[0]!.accion === 'cliente_modificado', 'Modificar un cliente queda registrado');
  const nuevo = productos.crear({ ...base, nombre: 'Galleta', precioVenta: 1 });
  productos.actualizar(nuevo.id, { nombre: 'Galleta', precioVenta: 1.5, costo: 1, stockMinimo: 1, controlaStock: true, unidadMedida: 'unidad', activo: true });
  productos.ajustarStock(nuevo.id, -3, 'se rompieron');
  const accionesProducto = actividad.listar({ desde: hoy, hasta: hoy }).filter((a) => a.entidad === 'producto').map((a) => a.accion).reverse();
  afirmar(accionesProducto.join() === 'producto_creado,producto_modificado,stock_ajustado', `Crear, modificar y ajustar stock de un producto quedan registrados (${accionesProducto.join(' → ')})`);
  afirmar(actividad.listar({ desde: hoy, hasta: hoy })[0]!.detalle === 'GALLETA (-3)', 'El ajuste de stock dice cuánto se ajustó («GALLETA (-3)»)');
  const prov2 = proveedores.crear('Vendedor ambulante');
  proveedores.actualizar(prov2.id, { nombre: 'Vendedor ambulante 2', activo: true });
  afirmar(actividad.listar({ desde: hoy, hasta: hoy }).filter((a) => a.entidad === 'proveedor').length === 3, 'Crear y modificar proveedores queda registrado');

  // ---------- 7. Administración de usuarios ----------
  actor.establecerUsuario(diego.id);
  const ana = await usuarios.crear({ nombre: 'ana', clave: 'ana_2024', rol: 'estandar' });
  await usuarios.cambiarClave(ana.id, 'secreta.99');
  usuarios.actualizar(ana.id, { rol: 'administrador' });
  usuarios.actualizar(ana.id, { activo: false });
  usuarios.desactivarControl();
  usuarios.activarControl();
  await usuarios.generarClaveRecuperacion();
  const accionesUsuarios = actividad.listar({ desde: hoy, hasta: hoy, usuarioId: diego.id }).map((a) => a.accion).reverse();
  afirmar(
    accionesUsuarios.join() === 'usuario_creado,clave_cambiada,usuario_modificado,usuario_modificado,control_desactivado,control_activado,clave_recuperacion_nueva',
    `La administración de usuarios queda registrada (${accionesUsuarios.join(' → ')})`,
  );
  const todoElTexto = JSON.stringify(actividad.listar({ desde: hoy, hasta: hoy }));
  afirmar(!/secreta\.99|Admin\.2024|ana_2024|maria#1/.test(todoElTexto), 'La bitácora NUNCA guarda contraseñas');

  // ---------- 8. Consultas ----------
  afirmar(actividad.listar({ desde: hoy, hasta: hoy, usuarioId: maria.id }).every((a) => a.usuarioId === maria.id), 'Se puede filtrar la actividad por usuario');
  afirmar(actividad.listar({ desde: sumarDiasLocalSql(-10), hasta: sumarDiasLocalSql(-5) }).length === 0, 'Fuera del rango de fechas no sale nada');
  afirmar(actividad.listar({ desde: hoy, hasta: hoy, limite: 3 }).length === 3, 'Se puede limitar la cantidad');
  const resumen = actividad.resumenVentasPorUsuario(hoy, hoy);
  const deLuis = resumen.find((r) => r.usuarioNombre === 'Luis')!;
  const sinUsuario = resumen.find((r) => r.usuarioNombre === 'Sin usuario')!;
  afirmar(!!deLuis && deLuis.cantidad >= 2 && deLuis.anuladas >= 3 && deLuis.total > 0, `Ventas por usuario: Luis ${deLuis.cantidad} ventas, ${deLuis.anuladas} anuladas, total ${deLuis.total}`);
  afirmar(!!sinUsuario && sinUsuario.anuladas === 1, 'Las ventas hechas antes del control salen como «Sin usuario»');

  // ---------- 9. Sin usuario dentro, otra vez: deja de registrar ----------
  actor.establecerUsuario(null);
  const antesFinal = cuantasActividades();
  caja.registrarIngreso(1, 'x', 'efectivo');
  productos.crear({ ...base, nombre: 'Pan', precioVenta: 1 });
  afirmar(cuantasActividades() === antesFinal, 'Al apagar el control (sin usuario dentro) deja de registrar');

  // ---------- 11. Excel: quién y cuándo creó, anuló o modificó cada transacción ----------
  afirmar(
    ENCABEZADOS_AUDITORIA.join() === 'usuario_creacion,usuario_anulacion,usuario_modificacion,fecha_creacion,fecha_anulacion,fecha_modificacion',
    'Las columnas de auditoría se llaman exactamente como se pidieron y en ese orden',
  );
  const ultimas6 = (fila: unknown[]) => fila.slice(-6);

  // Ventas: la crea Luis y la anula María.
  actor.establecerUsuario(luis.id);
  const ventaExcel = ventas.registrarVenta({ lineas: [{ productoId: gaseosa.id, cantidad: 3 }], metodoPago: 'efectivo' });
  actor.establecerUsuario(maria.id);
  ventas.anularVenta(ventaExcel.id, 'prueba excel');
  const pedidoExcel = `V-${ventaExcel.id}`;
  const vigentes = ventas.listarDetalleParaExportar(hoy, hoy);
  const anuladas = ventas.listarAnuladasParaExportar(hoy, hoy);
  afirmar(!vigentes.some((f) => f.pedido === pedidoExcel) && anuladas.some((f) => f.pedido === pedidoExcel), 'La venta anulada va en «anuladas» y ya no en las vigentes');
  const filaAnulada = anuladas.find((f) => f.pedido === pedidoExcel)!;
  afirmar(
    filaAnulada.auditoria.usuarioCreacion === 'Luis' &&
      filaAnulada.auditoria.usuarioAnulacion === 'Maria' &&
      filaAnulada.auditoria.usuarioModificacion === null &&
      filaAnulada.auditoria.fechaCreacion !== null &&
      (filaAnulada.auditoria.fechaAnulacion ?? '').startsWith(hoy) &&
      filaAnulada.auditoria.fechaModificacion === null,
    'Venta anulada: la creó Luis, la anuló María, con sus fechas; las ventas no se modifican',
  );
  const hojaAnuladas = construirHojaVentas(anuladas, 'Ventas anuladas');
  afirmar(hojaAnuladas.nombre === 'Ventas anuladas' && hojaAnuladas.encabezados.slice(-6).join() === ENCABEZADOS_AUDITORIA.join(), 'La hoja «Ventas anuladas» termina con las 6 columnas de auditoría');
  const valoresFila = ultimas6(hojaAnuladas.filas.find((f) => f[2] === pedidoExcel)!);
  afirmar(valoresFila[0] === 'Luis' && valoresFila[1] === 'Maria' && String(valoresFila[4]).startsWith(hoy), 'Los valores salen alineados bajo cada columna');
  const hojaVigentes = construirHojaVentas(vigentes);
  afirmar(hojaVigentes.encabezados.slice(-6).join() === ENCABEZADOS_AUDITORIA.join() && vigentes.every((f) => f.auditoria.usuarioAnulacion === null), 'La hoja «Ventas» (vigentes) también tiene las columnas, con anulación vacía');

  // Compras: la crea Diego, la modifica María, la anula Luis.
  actor.establecerUsuario(diego.id);
  const proveedorEx = proveedores.crear('Proveedor Excel');
  const compraEx = compras.registrarCompra({ proveedorId: proveedorEx.id, metodoPago: 'efectivo', lineas: [{ productoId: gaseosa.id, cantidad: 2, costoUnitario: 3 }] });
  actor.establecerUsuario(maria.id);
  compras.modificarCompra(compraEx.id, { proveedorId: proveedorEx.id, comprobante: 'F001-9', metodoPago: 'efectivo', lineas: [{ productoId: gaseosa.id, cantidad: 2, costoUnitario: 3 }] });
  actor.establecerUsuario(luis.id);
  compras.anularCompra(compraEx.id, 'prueba excel');
  const detalleCompra = compras.listarDetalleParaExportar(hoy, hoy).find((f) => f.compra === `C-${compraEx.id}`)!;
  const resumenCompra = compras.listarPorRango(hoy, hoy).find((c) => c.id === compraEx.id)!;
  for (const [nombre, a] of [['detalle', detalleCompra.auditoria], ['resumen', resumenCompra.auditoria]] as const) {
    afirmar(
      a.usuarioCreacion === 'Diego' && a.usuarioModificacion === 'Maria' && a.usuarioAnulacion === 'Luis' &&
        a.fechaCreacion !== null && a.fechaModificacion !== null && a.fechaAnulacion !== null,
      `Compra (${nombre}): la creó Diego, la modificó María y la anuló Luis, cada uno con su fecha`,
    );
  }
  afirmar(
    construirHojaComprasDetallado([detalleCompra]).encabezados.slice(-6).join() === ENCABEZADOS_AUDITORIA.join() &&
      construirHojaCompras([resumenCompra]).encabezados.slice(-6).join() === ENCABEZADOS_AUDITORIA.join(),
    'Las dos hojas de compras (detallado y resumen) tienen las 6 columnas',
  );

  // Caja: quién registró el movimiento y, si lo que lo originó se anuló, quién y cuándo.
  const movimientos = caja.listarMovimientosPorRango(hoy, hoy);
  const ingresoVentaAnulada = movimientos.find((m) => m.ventaId === ventaExcel.id && m.tipo === 'ingreso')!;
  afirmar(
    ingresoVentaAnulada.auditoria.usuarioCreacion === 'Luis' && ingresoVentaAnulada.auditoria.usuarioAnulacion === 'Maria' && ingresoVentaAnulada.auditoria.fechaAnulacion !== null,
    'Caja: el ingreso de una venta anulada dice quién lo registró (Luis) y quién anuló la venta (María)',
  );
  const egresoAnulacion = movimientos.find((m) => m.ventaId === ventaExcel.id && m.tipo === 'egreso')!;
  afirmar(egresoAnulacion.auditoria.usuarioCreacion === 'Maria', 'Caja: la devolución por la anulación la registró María');
  const manual = movimientos.find((m) => m.concepto.includes('Retiro para el banco'))!;
  afirmar(manual.auditoria.usuarioAnulacion === null && manual.auditoria.fechaAnulacion === null && manual.auditoria.usuarioModificacion === null, 'Caja: un movimiento manual no anulado tiene la anulación y la modificación vacías');
  const cobroAnulado = movimientos.find((m) => m.tipo === 'ingreso' && m.anulado && m.concepto.startsWith('Pago de deuda'));
  afirmar(!!cobroAnulado && cobroAnulado.auditoria.usuarioAnulacion === 'Luis' && cobroAnulado.auditoria.fechaAnulacion !== null, 'Caja: el cobro de fiado anulado dice quién lo anuló');
  const hojaCaja = construirHojaCaja(movimientos);
  afirmar(hojaCaja.encabezados.slice(-6).join() === ENCABEZADOS_AUDITORIA.join(), 'La hoja de caja termina con las 6 columnas');

  // El archivo Excel de verdad: dos hojas, con las columnas y las celdas vacías donde no hay dato.
  const libro = XLSX.read(generarLibroExcel([hojaVigentes, hojaAnuladas]), { type: 'array' });
  afirmar(libro.SheetNames.join() === 'Ventas,Ventas anuladas', `El Excel trae las hojas «${libro.SheetNames.join('» y «')}»`);
  const filasExcel = XLSX.utils.sheet_to_json<Record<string, unknown>>(libro.Sheets['Ventas anuladas']!, { defval: '' });
  const filaExcel = filasExcel.find((f) => f['Pedido'] === pedidoExcel)!;
  afirmar(filaExcel['usuario_creacion'] === 'Luis' && filaExcel['usuario_anulacion'] === 'Maria' && filaExcel['usuario_modificacion'] === '' && String(filaExcel['fecha_anulacion']).startsWith(hoy) && filaExcel['fecha_modificacion'] === '', 'En el archivo, cada celda sale bajo su encabezado y lo que no aplica queda vacío');

  // Sin control de usuarios: las fechas se guardan igual; los usuarios quedan vacíos.
  actor.establecerUsuario(null);
  const ventaSinControl = ventas.registrarVenta({ lineas: [{ productoId: gaseosa.id, cantidad: 1 }], metodoPago: 'efectivo' });
  ventas.anularVenta(ventaSinControl.id, 'sin control');
  const sinControl = ventas.listarAnuladasParaExportar(hoy, hoy).find((f) => f.pedido === `V-${ventaSinControl.id}`)!;
  afirmar(
    sinControl.auditoria.usuarioCreacion === null && sinControl.auditoria.usuarioAnulacion === null &&
      sinControl.auditoria.fechaCreacion !== null && sinControl.auditoria.fechaAnulacion !== null,
    'Sin control de usuarios: los usuarios salen vacíos pero las fechas sí se registran',
  );

  // ---------- 12. Ticket: nombre del vendedor ----------
  let premiumTicket = true;
  const contenedorFalso = {
    configuracion,
    ventas,
    clientes,
    usuarios,
    plan: { obtenerEstado: () => ({ tipo: premiumTicket ? 'premium' : 'gratis' }) },
  } as never;
  const vendedor = (ventaId: number) => construirDatosComprobanteDeVenta(contenedorFalso, ventaId).nombreVendedor;
  configuracion.establecerValor(CLAVE_TIENDA_VENDEDOR, 'Doña Carmen (dueña)');
  actor.establecerUsuario(luis.id);
  const ventaDeLuis = ventas.registrarVenta({ lineas: [{ productoId: gaseosa.id, cantidad: 1 }], metodoPago: 'efectivo' });
  actor.establecerUsuario(null);
  usuarios.activarControl();
  afirmar(vendedor(ventaDeLuis.id) === 'Luis', 'Con control de usuarios, el ticket muestra al usuario que hizo la venta (Luis)');
  afirmar(construirTextoComprobante(construirDatosComprobanteDeVenta(contenedorFalso, ventaDeLuis.id)).includes('Vendedor: Luis'), 'y el ticket impreso dice «Vendedor: Luis»');
  afirmar(vendedor(ventaSinControl.id) === 'Doña Carmen (dueña)', 'Una venta hecha SIN usuario (antes del control) muestra el vendedor de Información del Negocio');
  usuarios.desactivarControl();
  afirmar(vendedor(ventaDeLuis.id) === 'Doña Carmen (dueña)', 'Con el control apagado, el ticket muestra solo el vendedor de Información del Negocio');
  usuarios.activarControl();
  premiumTicket = false;
  afirmar(vendedor(ventaDeLuis.id) === 'Doña Carmen (dueña)', 'Con el Premium vencido (control suspendido) tampoco aparece el usuario');
  premiumTicket = true;
  configuracion.establecerValor(CLAVE_TIENDA_VENDEDOR, '');
  afirmar(!construirTextoComprobante(construirDatosComprobanteDeVenta(contenedorFalso, ventaSinControl.id)).includes('Vendedor:'), 'Sin vendedor configurado y sin usuario, no se imprime la línea de vendedor');

  // ---------- 10. El contenedor real conecta TODO igual que esta prueba ----------
  const contenedor = fs.readFileSync(path.join(__dirname, '..', 'src', 'infraestructura', 'sqlite', 'contenedor.ts'), 'utf8');
  for (const repo of ['ProductoRepositorioSqlite', 'ClienteRepositorioSqlite', 'CajaRepositorioSqlite', 'VentaRepositorioSqlite', 'FiadoRepositorioSqlite', 'ProveedorRepositorioSqlite', 'CompraRepositorioSqlite', 'UsuarioRepositorioSqlite']) {
    const linea = contenedor.split(/\r?\n/).find((l) => l.includes(`new ${repo}(`)) ?? '';
    afirmar(/actividad/.test(linea), `contenedor.ts le pasa la bitácora a ${repo}`);
  }
  console.log('\n🎉 La trazabilidad de usuarios funciona de punta a punta.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
