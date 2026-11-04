/**
 * Prueba de la pantalla Pedidos (antes Historial de ventas de Inicio): detalle de la venta (subtotales), acciones del pop-up, aviso al anular,
 * que las filas ya no tengan íconos, que el logo de WhatsApp reemplace al ícono de mensaje en toda la app y,
 * con una base de datos real, que ANULAR no borre la venta: queda marcada y se descuenta de totales y Caja.
 *
 * Uso: npx tsx scripts/probar-historial-ventas.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { TEXTO_CONFIRMAR_ANULACION, accionesDeVenta, avisoAnulacionFiado, construirDetalleVenta } from '../src/core/detalle-venta';
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

// ================= Detalle y acciones =================
const filas = construirDetalleVenta([
  { producto: 'Arroz', cantidad: 2, precioUnitario: 4.5 },
  { producto: 'Queso', cantidad: 1.5, precioUnitario: 20, descripcion: 'fresco' },
  { producto: 'Pan', cantidad: 3, precioUnitario: 0.1 },
  { producto: 'Antiguo', cantidad: 4 },
  { producto: 'Vacío', cantidad: 1, precioUnitario: 1, descripcion: '   ' },
]);
afirmar(filas[0]?.subtotal === 9 && filas[0]?.cantidadTexto === '2' && filas[0]?.precioUnitario === 4.5, 'Cada producto trae cantidad, precio unitario y subtotal (2 × 4.50 = 9.00)');
afirmar(filas[1]?.subtotal === 30 && filas[1]?.cantidadTexto === '1.5' && filas[1]?.descripcion === 'fresco', 'Cantidades con decimales (1.5 × 20 = 30) y descripción');
afirmar(filas[2]?.subtotal === 0.3, 'El subtotal se redondea sin errores de decimales (3 × 0.10 = 0.30)');
afirmar(filas[3]?.precioUnitario === null && filas[3]?.subtotal === null, 'Una venta antigua sin precio no inventa subtotal');
afirmar(filas[4]?.descripcion === null, 'Una descripción en blanco no se muestra');
afirmar(construirDetalleVenta([]).length === 0, 'Una venta sin productos no rompe');

afirmar(JSON.stringify(accionesDeVenta({ anulada: false }, true)) === '{"whatsapp":true,"reimprimir":"activo","anular":true}', 'Venta vigente en Premium: WhatsApp, Reimprimir y Anular');
afirmar(accionesDeVenta({ anulada: false }, false).reimprimir === 'premium', 'En Gratis, Reimprimir se muestra desactivado como función Premium');
afirmar(JSON.stringify(accionesDeVenta({ anulada: true }, true)) === '{"whatsapp":false,"reimprimir":"oculto","anular":false}', 'Una venta ya anulada no ofrece ninguna acción (solo consulta)');
afirmar(TEXTO_CONFIRMAR_ANULACION === '¿Seguro que quieres anular esta venta?', 'La pregunta de confirmación es «¿Seguro que quieres anular esta venta?»');
afirmar(avisoAnulacionFiado(0, 'S/') === null && avisoAnulacionFiado(-1, 'S/') === null, 'Sin abonos cobrados no hay aviso extra');
afirmar(avisoAnulacionFiado(25, 'S/') === 'Es un fiado y ya tiene S/ 25.00 cobrados. Solo se cancelará lo que falta por cobrar.', 'Un fiado con abonos avisa cuánto ya se cobró');

// ================= Código de las pantallas =================
const raiz = path.join(__dirname, '..');
const leer = (ruta: string) => readFileSync(path.join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');
const inicio = leer('src/app/pedidos/page.tsx');
const hoja = leer('src/components/detalle-venta-sheet.tsx');

afirmar(inicio.includes('>Pedidos</h1>') && !inicio.includes('Historial de ventas (') && !inicio.includes('pedidosAbiertos'), 'Pedidos: es una pantalla fija llamada «Pedidos» (sin desplegable)');
const iInicio = inicio.indexOf('pedidosFiltrados.map(');
const iFin = inicio.indexOf('resumen.cantidad > 0 && (', iInicio);
const filaJsx = inicio.slice(iInicio, iFin);
afirmar(!filaJsx.includes('💬') && !filaJsx.includes('🖨') && !filaJsx.includes('🗑') && !filaJsx.includes('role="button"'), 'Las filas ya no tienen los 3 íconos (mensaje, impresora, tacho)');
afirmar(['venta.comprobante', 'formatearFechaHora(venta.fechaHora)', 'etiquetaMetodoPago(venta.metodoPago)', 'venta.clienteNombre', 'formatearMonto(venta.total'].every((p) => filaJsx.includes(p)), 'Cada fila muestra número, fecha/hora, forma de pago, cliente y monto');
afirmar(!filaJsx.includes('usuarioNombre'), 'La fila no muestra nada más (ni el usuario)');
afirmar(filaJsx.includes('onClick={() => abrirDetalle(venta)}') && filaJsx.includes('<button'), 'Tocar una fila abre el detalle (es un botón real, sin botones anidados)');
afirmar(filaJsx.includes('Anulada') && filaJsx.includes('line-through'), 'Una venta anulada se ve con la etiqueta «Anulada» y el monto tachado');
afirmar(!inicio.includes('ventaExpandida') && inicio.includes('<DetalleVentaSheet'), 'La vista expandida se reemplazó por el pop-up de detalle');
afirmar(!inicio.includes('¿Eliminar el pedido'), 'El viejo cuadro «¿Eliminar el pedido…?» se reemplazó por la confirmación del pop-up');
afirmar(inicio.includes("pedirPermiso('anular_venta'") && inicio.includes('devolverCobrado'), 'Se conservan el permiso de anular y la pregunta de devolver lo cobrado en fiados');

afirmar(['Detalle del pedido', 'Enviar', 'Reimprimir', 'Anular pedido', 'Cancelar', 'TEXTO_CONFIRMAR_ANULACION', 'IconoWhatsApp'].every((p) => hoja.includes(p)), 'El pop-up tiene el detalle, los 3 botones y la confirmación (Cancelar / Anular)');
afirmar(['Fecha y hora', 'Forma de pago', 'Cliente', 'Total', 'construirDetalleVenta'].every((p) => hoja.includes(p)), 'El pop-up muestra fecha/hora, forma de pago, cliente, productos y total');
afirmar((hoja.match(/flex h-16 flex-col items-center justify-center gap-1/g) ?? []).length === 3 && hoja.includes('grid auto-cols-fr grid-flow-col gap-2'), 'Los 3 botones van en una sola fila, compactos (h-16) y de igual ancho, con el ícono arriba y el texto debajo');
afirmar(hoja.indexOf('<IconoWhatsApp') < hoja.indexOf('Enviar\n') && hoja.indexOf('<IconoImpresora') < hoja.indexOf('Reimprimir\n') && hoja.indexOf('<IconoTacho') < hoja.indexOf('Anular pedido\n') && hoja.indexOf('Enviar\n') < hoja.indexOf('<IconoImpresora') && hoja.indexOf('Reimprimir\n') < hoja.indexOf('<IconoTacho'), 'Orden: WhatsApp «Enviar», impresora «Reimprimir» y tacho «Anular pedido»');
const inicioAnular = hoja.indexOf('onClick={() => setConfirmando(true)}');
const botonAnular = hoja.slice(inicioAnular, hoja.indexOf('Anular pedido', inicioAnular) + 13);
afirmar(botonAnular.includes('bg-alerta') && botonAnular.includes('text-white') && hoja.includes('border-[#25D366]'), '«Anular pedido» va en rojo y «WhatsApp» con el verde de WhatsApp');

// ---- Logo de WhatsApp en toda la app
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : p.endsWith('.tsx') ? [p] : [];
  });
}
const todos = archivos(path.join(raiz, 'src')).map((p) => ({ ruta: path.relative(raiz, p), texto: readFileSync(p, 'utf8') }));
afirmar(!todos.some((a) => a.texto.includes('💬') || a.texto.includes('📲')), 'Ya no queda ningún ícono de mensaje (💬 / 📲) en la app');
for (const donde of ['src/app/fiados/page.tsx', 'src/app/mas/clientes/page.tsx', 'src/app/mas/proveedores/page.tsx', 'src/app/ventas/nueva/page.tsx', 'src/app/admin/page.tsx', 'src/components/detalle-venta-sheet.tsx']) {
  const a = todos.find((x) => x.ruta === donde);
  afirmar(Boolean(a?.texto.includes('<IconoWhatsApp')), `${donde} usa el logo de WhatsApp`);
}
const iconos = leer('src/components/ui/iconos.tsx');
afirmar(iconos.includes("COLOR_WHATSAPP = '#25D366'") && iconos.includes('fill="currentColor"') && iconos.includes('export function IconoWhatsApp'), 'El logo de WhatsApp es un ícono relleno que toma el color del texto (verde #25D366)');

// ================= Con base de datos real: anular NO borra =================
async function conBaseDeDatos() {
  const bd = await BaseDatosLocal.crear({ localizarArchivo: () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm') });
  const configuracion = new ConfiguracionRepositorioSqlite(bd);
  const productos = new ProductoRepositorioSqlite(bd);
  const clientes = new ClienteRepositorioSqlite(bd, configuracion);
  const caja = new CajaRepositorioSqlite(bd);
  const ventas = new VentaRepositorioSqlite(bd, productos, caja, configuracion);
  const fiados = new FiadoRepositorioSqlite(bd, caja);

  const arroz = productos.crear({ nombre: 'Arroz', costo: 2, precioVenta: 10, stockActual: 50, stockMinimo: 1, controlaStock: true, unidadMedida: 'unidad' });
  const v1 = ventas.registrarVenta({ lineas: [{ productoId: arroz.id, cantidad: 3 }], metodoPago: 'efectivo' });
  const v2 = ventas.registrarVenta({ lineas: [{ productoId: arroz.id, cantidad: 2 }], metodoPago: 'yape' });
  afirmar(caja.obtenerSaldoActual() === 50 && ventas.resumenDelDia().totalVentas === 50, 'Antes de anular: Caja 50 y total del día 50');

  ventas.anularVenta(v1.id);
  const lista = ventas.listarDeHoyConDetalle();
  const anulada = lista.find((v) => v.id === v1.id);
  afirmar(lista.length === 2 && anulada?.anulada === true && anulada.total === 30, 'Anular NO borra la venta: sigue en el historial, marcada como anulada y con su monto');
  afirmar(lista.find((v) => v.id === v2.id)?.anulada === false, 'La otra venta sigue vigente');
  afirmar(ventas.resumenDelDia().totalVentas === 20 && ventas.resumenDelDia().numeroVentas === 1, 'Se descuenta de los totales del día (50 → 20, 1 venta)');
  afirmar(caja.obtenerSaldoActual() === 20, 'Se descuenta de la Caja (50 → 20)');
  afirmar(ventas.contarTotalHistorico() === 1, 'No cuenta para el límite del plan Gratis');
  afirmar(productos.obtenerPorId(arroz.id).stockActual === 48, 'El stock de lo anulado vuelve al inventario (47 → 48 + … = 48)');
  afirmar(ventas.obtenerLineas(v1.id).length === 1 && ventas.obtenerLineas(v1.id)[0]?.cantidad === 3, 'El detalle de la venta anulada se puede seguir consultando (producto y cantidad)');
  let rechazo = '';
  try {
    ventas.anularVenta(v1.id);
  } catch (e) {
    rechazo = e instanceof Error ? e.message : '';
  }
  afirmar(rechazo.includes('ya estaba anulada'), 'Anular dos veces la misma venta se rechaza');
  const movimientos = caja.listarMovimientosDeHoy();
  afirmar(movimientos.length === 3 && movimientos.some((m) => m.tipo === 'egreso' && m.monto === 30), 'En Caja queda el rastro: el ingreso original y un egreso por la anulación (nada se borra)');

  // Fiado: la deuda del cliente baja y la venta queda anulada
  const c = clientes.crear('Ana', 'ANA0001', '999111222');
  const vf = ventas.registrarVenta({ lineas: [{ productoId: arroz.id, cantidad: 2 }], metodoPago: 'fiado', clienteId: c.id });
  afirmar(clientes.obtenerPorId(c.id).saldoPendiente === 20, 'Venta fiada: el cliente debe 20');
  ventas.anularVenta(vf.id);
  afirmar(clientes.obtenerPorId(c.id).saldoPendiente === 0 && ventas.listarDeHoyConDetalle().find((v) => v.id === vf.id)?.anulada === true, 'Al anular un fiado, la deuda del cliente baja a 0 y la venta queda marcada como anulada');
  afirmar(fiados.listarHistorialFiado(c.id)[0]?.ventaAnulada === true, 'La deuda de la venta anulada se ve como anulada en Fiados');
}

conBaseDeDatos()
  .then(() => console.log('🎉 Todas las pruebas de Pedidos (antes Historial de ventas) pasaron.'))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
