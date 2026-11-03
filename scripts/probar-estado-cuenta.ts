/**
 * Prueba del estado de cuenta de Fiados (Etapa F5): armado con saldo después de cada movimiento, compras
 * y pagos anulados, listas largas, textos largos, cliente sin historial, imagen (líneas) y WhatsApp (texto),
 * y el buscador por nombre, teléfono y DNI. Al final, con una base de datos real.
 *
 * Uso: npx tsx scripts/probar-estado-cuenta.ts
 */
import path from 'node:path';
import { construirEstadoCuenta, construirLineasEstadoCuenta, construirMensajeEstadoCuenta, fechaCompleta, fechaCorta, nombreArchivoEstadoCuenta, type DatosEstadoCuenta } from '../src/core/estado-cuenta';
import { coincideConBusqueda } from '../src/core/fiados-busqueda';
import type { DeudaPendienteDetalle, PagoFiado } from '../src/core/tipos';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { CajaRepositorioSqlite } from '../src/infraestructura/sqlite/caja.repositorio';
import { ClienteRepositorioSqlite } from '../src/infraestructura/sqlite/cliente.repositorio';
import { ConfiguracionRepositorioSqlite } from '../src/infraestructura/sqlite/configuracion.repositorio';
import { FiadoRepositorioSqlite } from '../src/infraestructura/sqlite/fiado.repositorio';
import { ProductoRepositorioSqlite } from '../src/infraestructura/sqlite/producto.repositorio';
import { VentaRepositorioSqlite } from '../src/infraestructura/sqlite/venta.repositorio';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const compra = (ventaId: number, fecha: string, monto: number, saldo: number, lineas: { producto: string; cantidad: number }[], anulada = false): DeudaPendienteDetalle => ({ ventaId, fecha, montoOriginal: monto, saldoPendiente: saldo, lineas, ventaAnulada: anulada });
const pago = (fecha: string, monto: number, metodoPago: PagoFiado['metodoPago'], extra: Partial<PagoFiado> = {}): PagoFiado => ({ clave: fecha, clienteId: 1, fecha, monto, metodoPago, fotoRuta: null, ventas: [], anulado: false, motivoAnulacion: null, fechaAnulacion: null, ...extra });
const ana = { nombre: 'Ana López', documento: '12345678', telefono: '987654321' };

// ================= Parte 1: armado =================
const historial = [
  compra(2, '2026-10-20 10:00:00', 25, 25, [{ producto: 'Aceite', cantidad: 1 }]),
  compra(1, '2026-10-11 09:00:00', 45, 20, [{ producto: 'Arroz', cantidad: 2 }, { producto: 'Azúcar', cantidad: 1.5 }]),
];
const pagos = [pago('2026-10-15 18:00:00', 25, 'yape')];
const e = construirEstadoCuenta({ ...ana, saldoPendiente: 45 }, historial, pagos);
afirmar(e.saldoActual === 45 && e.totalFiado === 70 && e.totalPagado === 25, 'Deuda 45, total fiado 70 y total pagado 25');
afirmar(e.movimientos.map((m) => m.titulo).join('|') === 'Compra V-1|Pago Yape|Compra V-2', 'Movimientos en orden de fecha (aunque el historial venga del más nuevo al más viejo)');
afirmar(e.movimientos.map((m) => m.saldoDespues).join(',') === '45,20,45', 'Saldo después de cada movimiento: 45 → 20 → 45');
afirmar(e.movimientos.at(-1)?.saldoDespues === e.saldoActual, 'El último saldo coincide con lo que debe hoy');
afirmar(e.movimientos[0]?.detalle === '2 Arroz, 1.5 Azúcar' && e.movimientos[0]?.monto === 45 && e.movimientos[1]?.monto === -25, 'Compras con sus productos (cantidades con decimales) y pagos en negativo');
afirmar(e.comprasPendientes.map((c) => `${c.ventaId}:${c.saldoPendiente}`).join('|') === '1:20|2:25', 'Compras pendientes de la más vieja a la más nueva, con su saldo');
afirmar(e.ultimosPagos.length === 1 && e.ultimosPagos[0]?.metodo === 'Yape', 'Últimos pagos con el método');

// ---- Sin historial
const vacio = construirEstadoCuenta({ ...ana, saldoPendiente: 0 }, [], []);
afirmar(vacio.movimientos.length === 0 && vacio.totalFiado === 0 && vacio.comprasPendientes.length === 0, 'Cliente sin historial: sin movimientos ni compras pendientes');

// ---- Saldo anterior (datos antiguos) y ajuste (venta anulada)
const antiguo = construirEstadoCuenta({ ...ana, saldoPendiente: 100 }, [compra(5, '2026-10-05 10:00:00', 30, 30, [{ producto: 'Pan', cantidad: 3 }])], []);
afirmar(antiguo.movimientos[0]?.tipo === 'saldo_anterior' && antiguo.movimientos[0]?.monto === 70 && antiguo.movimientos.at(-1)?.saldoDespues === 100, 'Deuda de antes del historial: aparece como «Saldo anterior» y todo cuadra con lo que debe');
const conAnulada = construirEstadoCuenta({ ...ana, saldoPendiente: 0 }, [compra(2, '2026-11-01 08:00:00', 20, 0, [{ producto: 'Arroz', cantidad: 2 }], true), compra(1, '2026-11-01 07:00:00', 30, 0, [{ producto: 'Arroz', cantidad: 3 }])], [pago('2026-11-01 09:00:00', 35, 'yape')]);
afirmar(conAnulada.totalFiado === 30 && !conAnulada.movimientos.some((m) => m.titulo === 'Compra V-2'), 'Una venta anulada no cuenta como compra ni aparece como «pagada»');
afirmar(conAnulada.movimientos[0]?.tipo === 'ajuste' && conAnulada.movimientos.at(-1)?.saldoDespues === 0, 'Pagos aplicados a una venta anulada: se muestra como ajuste y el saldo final cuadra (0)');

// ---- Pago anulado
const conPagoAnulado = construirEstadoCuenta({ ...ana, saldoPendiente: 30 }, [compra(1, '2026-10-01 09:00:00', 30, 30, [{ producto: 'Pan', cantidad: 3 }])], [pago('2026-10-02 10:00:00', 30, 'efectivo', { anulado: true, motivoAnulacion: 'Se equivocó de cliente' })]);
const mAnulado = conPagoAnulado.movimientos.find((m) => m.tipo === 'pago_anulado');
afirmar(mAnulado?.monto === 0 && mAnulado.saldoDespues === 30 && mAnulado.detalle === 'Efectivo. Motivo: Se equivocó de cliente', 'Un pago anulado se muestra con su motivo y NO cambia el saldo');
afirmar(conPagoAnulado.totalPagado === 0 && conPagoAnulado.ultimosPagos.length === 0, 'Un pago anulado no suma a lo pagado ni a los últimos pagos');

// ---- Lista larga
const muchas: DeudaPendienteDetalle[] = [];
for (let i = 1; i <= 40; i++) muchas.push(compra(i, `2026-09-${String(i % 28 + 1).padStart(2, '0')} 10:00:00`, 10, i === 40 ? 10 : 0, [{ producto: 'Pan', cantidad: 1 }]));
const largo = construirEstadoCuenta({ ...ana, saldoPendiente: 10 }, muchas, [pago('2026-10-20 10:00:00', 390, 'efectivo')], 30);
afirmar(largo.movimientos.length === 31 && largo.movimientosOmitidos === 11, 'Con 41 movimientos y límite 30: se muestran los últimos 30 + un resumen de los 11 anteriores');
afirmar(largo.movimientos[0]?.tipo === 'saldo_anterior' && largo.movimientos[0]?.detalle === '11 movimientos anteriores', 'El resumen dice cuántos movimientos quedaron atrás');
afirmar(largo.movimientos.at(-1)?.saldoDespues === 10, 'Aun resumido, el último saldo cuadra con lo que debe');

// ================= Parte 2: imagen y WhatsApp =================
const datos: DatosEstadoCuenta = { tienda: { nombre: 'Bodega Doña Rosa', documento: null, ubicacion: 'Av. Los Olivos 123', contacto: '999 111 222', leyenda: null }, simboloMoneda: 'S/', fecha: '01/11/2026', estado: e };
const lineas = construirLineasEstadoCuenta(datos, 40);
const textos = lineas.map((l) => l.texto);
afirmar(textos.includes('ESTADO DE CUENTA') && textos.includes('DOCUMENTO INTERNO'), 'La imagen dice «ESTADO DE CUENTA» y «DOCUMENTO INTERNO»');
afirmar(textos.at(-1) === 'Documento interno, sin valor tributario', 'Lo último de la imagen es «Documento interno, sin valor tributario»');
afirmar(lineas.every((l) => l.texto.trim().length <= 40), 'Ninguna línea pasa de 40 caracteres (no se corta ni se sale)');
afirmar(textos.some((t) => t.startsWith('DEUDA ACTUAL:') && t.endsWith('S/ 45.00')), 'La deuda actual va a la derecha: «DEUDA ACTUAL: … S/ 45.00»');
afirmar(textos.some((t) => t.startsWith('11/10/26 Compra V-1') && t.endsWith('+S/ 45.00')) && textos.some((t) => t.startsWith('15/10/26 Pago Yape') && t.endsWith('-S/ 25.00')), 'Compras en positivo y pagos en negativo, con fecha corta');
afirmar(textos.some((t) => t.trim() === '2 Arroz, 1.5 Azúcar'), 'Cada compra lista sus productos');
afirmar(textos.includes('COMPRAS PENDIENTES DE PAGO') && textos.some((t) => t.startsWith('11/10/26 V-1') && t.endsWith('S/ 20.00')), 'Compras pendientes con lo que falta pagar de cada una');
afirmar(textos.some((t) => t === '  de S/ 45.00 (ya abonó)'), 'Si abonó algo, dice de cuánto era la compra');
afirmar(lineas[0]?.grande === true && lineas[0]?.negrita === true && lineas[0]?.alineacion === 'centro', 'El nombre de la tienda va arriba, grande y centrado');

const largoTexto = construirLineasEstadoCuenta({ ...datos, estado: { ...e, clienteNombre: 'María Fernanda de los Ángeles Quispe Huamán de Rodríguez', movimientos: [{ tipo: 'compra', fecha: '2026-10-11 09:00:00', titulo: 'Compra V-1', detalle: '12 Gaseosa grande sabor naranja, 8 Galleta de vainilla con crema, 3 Aceite vegetal', monto: 45, saldoDespues: 45 }] } }, 40);
afirmar(largoTexto.every((l) => l.texto.length <= 40), 'Nombres y listas de productos muy largos se envuelven en varias líneas (nada pasa de 40)');
afirmar(largoTexto.filter((l) => l.texto.includes('Gaseosa') || l.texto.includes('Galleta') || l.texto.includes('Aceite')).length >= 2, 'La lista larga de productos ocupa varias líneas en vez de cortarse');
const lineasVacio = construirLineasEstadoCuenta({ ...datos, estado: vacio }, 40).map((l) => l.texto);
afirmar(lineasVacio.includes('Todavía no tiene movimientos.') && !lineasVacio.includes('COMPRAS PENDIENTES DE PAGO'), 'Cliente sin historial: «Todavía no tiene movimientos.» y sin sección de pendientes');
const angosto = construirLineasEstadoCuenta(datos, 32).map((l) => l.texto);
afirmar(angosto.at(-2) === 'Documento interno,' && angosto.at(-1) === 'sin valor tributario' && angosto.every((x) => x.length <= 32), 'En papel angosto (32) la leyenda se parte en dos líneas y nada pasa de 32');

const msg = construirMensajeEstadoCuenta(datos);
afirmar(msg.includes('Hola Ana López') && msg.includes('al 01/11/2026') && msg.includes('*Deuda actual: S/ 45.00*'), 'WhatsApp: saludo, fecha y deuda actual');
afirmar(msg.includes('• 11/10/26 (V-1): 2 Arroz, 1.5 Azúcar — debes S/ 20.00 de S/ 45.00') && msg.includes('• 20/10/26 (V-2): 1 Aceite — S/ 25.00'), 'WhatsApp: compras pendientes (con lo que falta si abonó algo)');
afirmar(msg.includes('• 15/10/26: S/ 25.00 (Yape)'), 'WhatsApp: últimos pagos');
afirmar(construirMensajeEstadoCuenta({ ...datos, estado: vacio }).includes('*No tienes deuda pendiente*') && !construirMensajeEstadoCuenta({ ...datos, estado: vacio }).includes('Compras pendientes'), 'WhatsApp sin deuda: «No tienes deuda pendiente»');
afirmar(fechaCompleta('2026-10-11 09:00:00') === '11/10/2026' && fechaCorta('2026-10-11 09:00:00') === '11/10/26' && fechaCorta('') === '', 'Fechas: completa, corta y vacía sin romper');

afirmar(nombreArchivoEstadoCuenta('Ana López') === 'estado-cuenta-ana-lopez.png', 'Nombre del archivo sin tildes ni espacios: estado-cuenta-ana-lopez.png');
afirmar(nombreArchivoEstadoCuenta('  Ñandú / Pérez & Hnos.  ') === 'estado-cuenta-nandu-perez-hnos.png' && nombreArchivoEstadoCuenta('???') === 'estado-cuenta-cliente.png', 'Nombre del archivo: símbolos fuera y «cliente» si no queda nada');
afirmar(nombreArchivoEstadoCuenta('María Fernanda de los Ángeles Quispe Huamán').length <= 'estado-cuenta-.png'.length + 30, 'Nombre del archivo: un nombre larguísimo se recorta');

// ================= Parte 3: buscador =================
const rosa = { nombre: 'Rosa María Quispe', documento: '45678912', telefono: '987 654 321', saldoPendiente: 45.5 };
const jose = { nombre: 'José Pérez', documento: null, telefono: null, saldoPendiente: 10 };
afirmar(coincideConBusqueda(rosa, '') && coincideConBusqueda(rosa, '   '), 'Búsqueda vacía: todos');
afirmar(coincideConBusqueda(rosa, 'rosa') && coincideConBusqueda(rosa, 'QUISPE') && !coincideConBusqueda(rosa, 'pablo'), 'Por nombre (sin importar mayúsculas)');
afirmar(coincideConBusqueda(jose, 'jose') && coincideConBusqueda(jose, 'perez') && coincideConBusqueda(rosa, 'maria'), 'Ignora tildes (jose → José, maría → María)');
afirmar(coincideConBusqueda(rosa, 'quispe rosa'), 'Varias palabras en cualquier orden');
afirmar(coincideConBusqueda(rosa, '45678'), 'Por DNI');
afirmar(coincideConBusqueda(rosa, '987654321') && coincideConBusqueda(rosa, '654 321') && coincideConBusqueda(rosa, '987-654'), 'Por teléfono (con espacios o guiones, aunque esté guardado con espacios)');
afirmar(!coincideConBusqueda({ ...rosa, documento: null, nombre: 'Luis', saldoPendiente: 3 }, '65'), 'Con menos de 3 dígitos no se busca en el teléfono');
afirmar(coincideConBusqueda(rosa, '45.50') && coincideConBusqueda(jose, '10.00'), 'Por monto de la deuda, como antes');
afirmar(!coincideConBusqueda(jose, '987654321'), 'Un cliente sin teléfono ni documento no revienta la búsqueda');

// ================= Parte 4: con base de datos real =================
async function conBaseDeDatos() {
  const bd = await BaseDatosLocal.crear({ localizarArchivo: () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm') });
  const configuracion = new ConfiguracionRepositorioSqlite(bd);
  const productos = new ProductoRepositorioSqlite(bd);
  const clientes = new ClienteRepositorioSqlite(bd, configuracion);
  const caja = new CajaRepositorioSqlite(bd);
  const ventas = new VentaRepositorioSqlite(bd, productos, caja, configuracion);
  const fiados = new FiadoRepositorioSqlite(bd, caja);

  const arroz = productos.crear({ nombre: 'Arroz', costo: 2, precioVenta: 10, stockActual: 50, stockMinimo: 1, controlaStock: true, unidadMedida: 'unidad' });
  const c = clientes.crear('Ana López', 'ANA0001', '999111222');
  ventas.registrarVenta({ lineas: [{ productoId: arroz.id, cantidad: 3 }], metodoPago: 'fiado', clienteId: c.id }); // 30
  const v2 = ventas.registrarVenta({ lineas: [{ productoId: arroz.id, cantidad: 2 }], metodoPago: 'fiado', clienteId: c.id }); // 20
  fiados.registrarPago(c.id, 35, 'yape');
  ventas.anularVenta(v2.id, 'error de digitación');

  const historialReal = fiados.listarHistorialFiado(c.id);
  afirmar(historialReal.find((d) => d.ventaId === v2.id)?.ventaAnulada === true, 'Con base real: el historial marca como anulada la venta fiada anulada');
  afirmar(historialReal.find((d) => d.ventaId !== v2.id)?.ventaAnulada === false, 'Con base real: la venta vigente no se marca como anulada');
  const real = construirEstadoCuenta(clientes.obtenerPorId(c.id), historialReal, fiados.listarPagosDeCliente(c.id));
  afirmar(real.saldoActual === 0 && real.movimientos.at(-1)?.saldoDespues === 0, 'Con base real: el saldo final del estado de cuenta cuadra con lo que debe el cliente (0)');
  afirmar(!real.movimientos.some((m) => m.titulo === `Compra V-${v2.id}`) && real.totalFiado === 30, 'Con base real: la venta anulada no cuenta como compra');

  // Un cliente con deuda viva y un pago anulado
  const d = clientes.crear('Pedro Ruiz', 'PEDRO01', null);
  ventas.registrarVenta({ lineas: [{ productoId: arroz.id, cantidad: 4 }], metodoPago: 'fiado', clienteId: d.id }); // 40
  fiados.registrarPago(d.id, 15, 'efectivo');
  const pagoId = fiados.listarPagosDeCliente(d.id)[0];
  if (!pagoId) throw new Error('❌ Falló: no se encontró el pago');
  fiados.anularPago(d.id, pagoId.clave, 'cobro duplicado');
  const real2 = construirEstadoCuenta(clientes.obtenerPorId(d.id), fiados.listarHistorialFiado(d.id), fiados.listarPagosDeCliente(d.id));
  afirmar(real2.saldoActual === 40 && real2.movimientos.at(-1)?.saldoDespues === 40, 'Con base real: tras anular un pago la deuda vuelve a 40 y el estado de cuenta cuadra');
  afirmar(real2.movimientos.some((m) => m.tipo === 'pago_anulado' && (m.detalle ?? '').includes('cobro duplicado')), 'Con base real: el pago anulado aparece con su motivo');
}

conBaseDeDatos()
  .then(() => console.log('🎉 Todas las pruebas de Fiados F5 pasaron.'))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
