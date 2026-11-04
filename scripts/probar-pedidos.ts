/**
 * Prueba de la pantalla «Pedidos»: el buscador (cliente, producto, forma de pago, monto), los totales del rango,
 * que abra con los pedidos de hoy, que Inicio ya no tenga el historial, y que el detalle de un pedido NO tape la
 * barra inferior ni esconda «Anular pedido». Lógica pura + revisión del código fuente (el aspecto real solo se ve
 * en el celular).
 *
 * Uso: npx tsx scripts/probar-pedidos.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { etiquetaMetodoPago, filtrarPedidos, rangoEsHoy, rangoInvalido, resumirPedidos } from '../src/core/pedidos';
import type { LineaVentaResumen, VentaListaItem } from '../src/core/tipos';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const venta = (id: number, metodoPago: VentaListaItem['metodoPago'], total: number, clienteNombre: string | null = null, anulada = false): VentaListaItem => ({
  id, fechaHora: '2026-11-03 10:00:00', metodoPago, total, clienteNombre, anulada, usuarioNombre: null, tipoComprobante: 'nota_venta', comprobante: `V-${id}`,
}) as VentaListaItem;
const linea = (producto: string): LineaVentaResumen => ({ producto, cantidad: 1, precioUnitario: 1 }) as LineaVentaResumen;

const pedidos = [
  venta(1, 'efectivo', 3, null),
  venta(2, 'yape', 9, 'José Pérez'),
  venta(3, 'fiado', 20.5, 'Ana López'),
  venta(4, 'plin', 12, 'Ana López', true),
];
const lineas: Record<number, LineaVentaResumen[]> = { 1: [linea('INCA KOLA 500ML')], 2: [linea('LOMO SALTADO')], 3: [linea('Lomo saltado'), linea('Arroz')] };
const ids = (r: VentaListaItem[]) => r.map((v) => v.id).join(',');

// ---- Buscador
afirmar(ids(filtrarPedidos(pedidos, lineas, '')) === '1,2,3,4' && ids(filtrarPedidos(pedidos, lineas, '   ')) === '1,2,3,4', 'Sin texto se ven todos los pedidos');
afirmar(ids(filtrarPedidos(pedidos, lineas, 'ana')) === '3,4', 'Por cliente: «ana» trae los de Ana López');
afirmar(ids(filtrarPedidos(pedidos, lineas, 'jose')) === '2', 'Por cliente sin tildes: «jose» encuentra «José»');
afirmar(ids(filtrarPedidos(pedidos, lineas, 'eventual')) === '1', 'Un pedido sin cliente se busca como «Cliente eventual»');
afirmar(ids(filtrarPedidos(pedidos, lineas, 'lomo')) === '2,3', 'Por producto: «lomo» trae los pedidos con LOMO SALTADO (mayúsculas o no)');
afirmar(ids(filtrarPedidos(pedidos, lineas, 'arroz')) === '3', 'Por producto: «arroz»');
afirmar(ids(filtrarPedidos(pedidos, lineas, 'yape')) === '2' && ids(filtrarPedidos(pedidos, lineas, 'EFECTIVO')) === '1', 'Por forma de pago: «yape», «EFECTIVO»');
afirmar(ids(filtrarPedidos(pedidos, lineas, 'fiado')) === '3' && ids(filtrarPedidos(pedidos, lineas, 'plin')) === '4', 'Por forma de pago: «fiado», «plin» (también las anuladas)');
afirmar(ids(filtrarPedidos(pedidos, lineas, '20.50')) === '3', 'Por monto: «20.50»');
afirmar(ids(filtrarPedidos(pedidos, lineas, 'ana fiado')) === '3' && ids(filtrarPedidos(pedidos, lineas, 'fiado ana')) === '3', 'Varias palabras en cualquier orden: «ana fiado»');
afirmar(ids(filtrarPedidos(pedidos, lineas, 'yape ana')) === '', 'Varias palabras: deben cumplirse todas («yape ana» no existe)');
afirmar(ids(filtrarPedidos(pedidos, {}, 'lomo')) === '', 'Sin los productos cargados, buscar un producto no inventa resultados');
afirmar(ids(filtrarPedidos(pedidos, {}, 'yape')) === '2', 'Sin los productos cargados, cliente y forma de pago se buscan igual');
afirmar(etiquetaMetodoPago('yape') === 'Yape' && etiquetaMetodoPago('otro') === 'otro', 'Etiquetas de forma de pago');

// ---- Totales y rango
const r = resumirPedidos(pedidos);
afirmar(r.cantidad === 3 && r.total === 32.5, 'El resumen cuenta solo los pedidos vigentes (la anulada de 12.00 no suma): 3 pedidos, 32.50');
afirmar(resumirPedidos([]).cantidad === 0 && resumirPedidos([]).total === 0, 'Sin pedidos: 0 y 0.00');
afirmar(resumirPedidos([venta(1, 'efectivo', 0.1), venta(2, 'efectivo', 0.2)]).total === 0.3, 'Los totales no arrastran errores de decimales (0.10 + 0.20 = 0.30)');
afirmar(rangoEsHoy('2026-11-03', '2026-11-03', '2026-11-03') && !rangoEsHoy('2026-11-02', '2026-11-03', '2026-11-03'), 'El rango es «hoy» solo si desde y hasta son hoy');
afirmar(rangoInvalido('2026-11-04', '2026-11-03') && !rangoInvalido('2026-11-03', '2026-11-03'), 'Un «desde» posterior al «hasta» es inválido');

// ---- Código de las pantallas
const raiz = path.join(__dirname, '..');
const leer = (ruta: string) => readFileSync(path.join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');
const pagina = leer('src/app/pedidos/page.tsx');
const inicio = leer('src/app/page.tsx');
const hoja = leer('src/components/detalle-venta-sheet.tsx');
const barra = leer('src/components/barra-inferior.tsx');
const iconos = leer('src/components/ui/iconos.tsx');

afirmar(existsSync(path.join(raiz, 'src/app/pedidos/page.tsx')), 'Existe la pantalla /pedidos');
afirmar(/useState\(hoyLocalSql\(\)\)/.test(pagina) && (pagina.match(/useState\(hoyLocalSql\(\)\)/g) ?? []).length === 2, 'Pedidos abre con el rango de HOY por defecto (desde y hasta)');
afirmar(pagina.includes('type="date"') && pagina.includes('Buscar cliente, producto, pago o monto…') && pagina.includes('filtrarPedidos('), 'Tiene rango de fechas y buscador (cliente, producto, forma de pago, monto)');
afirmar(!/\[\w*[aA]biert\w*,/.test(pagina) && !pagina.includes('⌄') && !pagina.includes('aria-expanded'), 'La lista es fija: no hay ningún despliegue (ni estado «abierto», ni flecha)');
afirmar(pagina.includes('<DetalleVentaSheet') && pagina.includes('abrirDetalle(venta)') && pagina.includes("pedirPermiso('anular_venta'"), 'Tocar un pedido abre su detalle y anular conserva el permiso');

// Inicio ya no tiene el historial
afirmar(!inicio.includes('Historial de ventas</span>') && !inicio.includes('DetalleVentaSheet') && !inicio.includes('MenuImprimirTicket') && !inicio.includes('pedidosFiltrados') && !inicio.includes('type="date"'), 'Inicio ya no tiene el Historial de ventas (ni su rango de fechas, buscador, detalle o menú de ticket)');
afirmar(inicio.includes('Ventas de los últimos 7 días') && inicio.includes('<TarjetaParaHoy') && inicio.includes('Ganancia estimada'), 'Inicio conserva el resumen, «Para hoy» y el gráfico de 7 días');

// Barra: Pedidos con ícono propio (ya no el carrito)
afirmar(barra.includes('pedidos: IconoPedidos') && !barra.includes('IconoVenta') && !iconos.includes('IconoVenta'), 'La barra usa el ícono de Pedidos (el carrito ya no existe)');
afirmar(iconos.includes('export const IconoPedidos') && !iconos.slice(iconos.indexOf('export const IconoPedidos'), iconos.indexOf('export const IconoProductos')).includes('circle'), 'El ícono de Pedidos es una tablilla con lista (sin las ruedas del carrito)');

// Detalle: no tapa la barra y «Anular pedido» siempre se ve
afirmar(hoja.includes('createPortal(') && hoja.includes('document.body'), 'El detalle se dibuja en un portal sobre <body> (ya no queda atrapado en la pantalla animada)');
afirmar(hoja.includes('bottom-[calc(4rem+var(--area-segura-abajo)+var(--desfase-viewport-abajo,0px))]') && hoja.includes('z-40'), 'El detalle termina donde empieza la barra inferior (misma altura que la barra: 4 rem + área segura + ajuste), por encima de ella (z-40 > z-30)');
afirmar(!hoja.includes('inset-0 z-50 flex items-end') && !hoja.includes('max-h-[90dvh]') && hoja.includes('max-h-full'), 'El panel nunca es más alto que el espacio sobre la barra');
const iScroll = hoja.indexOf('flex-1 overflow-y-auto');
const iBotones = hoja.indexOf('border-t border-linea px-5 pb-4 pt-3');
afirmar(iScroll > 0 && iBotones > iScroll && hoja.slice(iScroll, iBotones).includes('</div>'), 'Lo que se desplaza es el detalle de arriba; los 3 botones van fuera de esa zona y no se esconden');
afirmar(hoja.includes('Anular pedido') && !hoja.includes('Anular venta'), 'El botón se llama «Anular pedido»');
afirmar(barra.includes('z-30'), 'La barra sigue en z-30 (debajo del detalle solo en la zona que el detalle no ocupa)');

console.log('🎉 Todas las pruebas de Pedidos pasaron.');
