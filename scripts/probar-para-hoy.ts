/**
 * Prueba de la tarjeta «Para hoy» de Inicio (Etapa V4a): qué avisa y cuándo, el respaldo pendiente,
 * y a qué pantalla lleva cada cosa. Lógica pura: no necesita celular.
 *
 * Uso: npx tsx scripts/probar-para-hoy.ts
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { construirParaHoy, estadoRespaldo, textoResumenPendientes, type EstadoRespaldo } from '../src/core/para-hoy';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const hoy = '2026-10-31';
const base = { hayDatos: true, ultimaAuto: null, ultimoManual: null, hoy };

// ---- Respaldo pendiente (a los 2 días o más)
afirmar(estadoRespaldo({ ...base, hayDatos: false }).pendiente === false, 'Una app sin datos todavía no avisa de respaldo');
const nunca = estadoRespaldo(base);
afirmar(nunca.pendiente && nunca.nunca && nunca.dias === null, 'Con datos y sin ningún respaldo: pendiente («nunca»)');
afirmar(estadoRespaldo({ ...base, ultimoManual: '2026-10-31' }).pendiente === false, 'Respaldo de hoy: nada pendiente');
afirmar(estadoRespaldo({ ...base, ultimoManual: '2026-10-30' }).pendiente === false, 'Respaldo de ayer (1 día): todavía no avisa');
const dosDias = estadoRespaldo({ ...base, ultimoManual: '2026-10-29' });
afirmar(dosDias.pendiente && dosDias.dias === 2 && !dosDias.nunca, 'A los 2 días sin respaldo ya avisa (hace 2 días)');
afirmar(estadoRespaldo({ ...base, ultimoManual: '2026-10-25' }).pendiente === true, 'A los 6 días también avisa');
afirmar(estadoRespaldo({ ...base, ultimaAuto: '2026-10-28' }).pendiente === true, 'Un respaldo automático de hace 3 días también cuenta como atrasado');
afirmar(estadoRespaldo({ ...base, ultimaAuto: '2026-09-01', ultimoManual: '2026-10-30' }).pendiente === false, 'Cuenta el más reciente: un manual de ayer cubre un automático viejo');
afirmar(estadoRespaldo({ ...base, ultimaAuto: '2026-10-30', ultimoManual: '2026-08-01' }).dias === 1, 'Cuenta el más reciente: un automático de ayer cubre un manual viejo');
afirmar(estadoRespaldo({ ...base, ultimaAuto: '2026-10-27', ultimoManual: '2026-10-31' }).pendiente === false, 'Con el automático atrasado, un respaldo manual de hoy lo resuelve');
afirmar(estadoRespaldo({ ...base, ultimoManual: '2026-11-15' }).dias === 0 && estadoRespaldo({ ...base, ultimoManual: '2026-11-15' }).pendiente === false, 'Un reloj atrasado (fecha futura) no da días negativos ni avisa');
afirmar(estadoRespaldo({ ...base, ultimaAuto: 'basura', ultimoManual: null }).nunca === true, 'Una fecha mal escrita se ignora');
afirmar(estadoRespaldo({ ...base, ultimoManual: '2026-12-30', hoy: '2027-01-01' }).dias === 2 && estadoRespaldo({ ...base, ultimoManual: '2026-12-30', hoy: '2027-01-01' }).pendiente === true, 'Cambio de año: del 30/12 al 01/01 son 2 días y avisa');

// ---- Tarjeta
const sinPendiente: EstadoRespaldo = { pendiente: false, nunca: false, dias: 1 };
const datos = { productosStockBajo: 0, respaldo: sinPendiente, simboloMoneda: 'S/' };
afirmar(construirParaHoy(datos).length === 0, 'Sin nada pendiente la lista queda vacía («Todo al día»)');

const soloStock = construirParaHoy({ ...datos, productosStockBajo: 3 });
afirmar(soloStock.length === 1 && soloStock[0]?.titulo === '3 productos con stock bajo' && soloStock[0]?.href === '/productos', 'Stock bajo: «3 productos con stock bajo» → Productos');
afirmar(construirParaHoy({ ...datos, productosStockBajo: 1 })[0]?.titulo === '1 producto con stock bajo', 'Stock bajo en singular: «1 producto con stock bajo»');


const nuncaResp = construirParaHoy({ ...datos, respaldo: { pendiente: true, nunca: true, dias: null } })[0];
afirmar(nuncaResp?.id === 'respaldo' && nuncaResp.detalle === 'Aún no tienes ningún respaldo de tus datos.' && nuncaResp.href === '/mas/respaldo', 'Respaldo nunca hecho: texto claro → Respaldo');
afirmar(construirParaHoy({ ...datos, respaldo: { pendiente: true, nunca: false, dias: 9 } })[0]?.detalle === 'Tu último respaldo fue hace 9 días.', 'Respaldo atrasado: «Tu último respaldo fue hace 9 días.»');
afirmar(construirParaHoy({ ...datos, respaldo: { pendiente: true, nunca: false, dias: 1 } })[0]?.detalle === 'Tu último respaldo fue ayer.', 'Respaldo de ayer: «fue ayer»');

const todo = construirParaHoy({ ...datos, productosStockBajo: 2, totalPorCobrar: 30, respaldo: { pendiente: true, nunca: true, dias: null } });
afirmar(todo.map((p) => p.id).join(',') === 'cobro,stock,respaldo', 'Con todo pendiente, el orden es Por cobrar, Stock y Respaldo');
afirmar(new Set(todo.map((p) => p.href)).size === 3, 'Cada aviso lleva a una pantalla distinta');
for (const p of todo) {
  const archivo = path.join(__dirname, '..', 'src/app', p.href, 'page.tsx');
  afirmar(existsSync(archivo), `El acceso directo ${p.href} existe como pantalla`);
}
afirmar(todo.every((p) => (p.tono === 'aviso')), 'Por cobrar, stock y respaldo van en dorado');

// ---- Fila plegada de «Para hoy» y sección de ventas por forma de pago quitada
afirmar(textoResumenPendientes(3) === 'Tienes 3 pendientes', 'Fila cerrada: «Tienes 3 pendientes»');
afirmar(textoResumenPendientes(1) === 'Tienes 1 pendiente', 'Fila cerrada en singular: «Tienes 1 pendiente»');
afirmar(textoResumenPendientes(0) === 'Todo al día ✓', 'Sin pendientes: «Todo al día ✓»');
afirmar(textoResumenPendientes(todo.length) === 'Tienes 3 pendientes', 'El número sale de la cantidad de avisos de la lista');
const tarjeta = readFileSync(path.join(__dirname, '..', 'src/components/tarjeta-para-hoy.tsx'), 'utf8');
afirmar(/useState\(false\)/.test(tarjeta) && tarjeta.includes('aria-expanded'), 'La tarjeta arranca plegada y se despliega a mano');
const inicio = readFileSync(path.join(__dirname, '..', 'src/app/page.tsx'), 'utf8');
afirmar(!inicio.includes('Todavía no registras ventas hoy') && !inicio.includes('Hacer una venta') && !inicio.includes('porMetodoPago'), 'Inicio ya no muestra el desglose por forma de pago ni el aviso «Todavía no registras ventas hoy»');
afirmar(inicio.includes('<TarjetaParaHoy'), 'Inicio sigue mostrando «Para hoy»');
afirmar(/useState\(false\)/.test(inicio) && inicio.includes('Ver gráfico') && /graficoAbierto\s*&&\s*\(/.test(inicio), 'El gráfico de 7 días solo se dibuja al desplegar «Ver gráfico» (arranca cerrado)');
afirmar(inicio.includes('Ventas de los últimos 7 días') && inicio.includes('Mejor día'), 'El título y el texto de «Ventas de los últimos 7 días» siguen a la vista');

// ---- «Pendientes de cobro» es un pendiente más (dentro de «Tienes N pendientes»)
const cobro = construirParaHoy({ ...datos, totalPorCobrar: 21 })[0];
afirmar(cobro?.id === 'cobro' && cobro.titulo === 'S/ 21.00 pendientes de cobro' && cobro.href === '/fiados' && cobro.tono === 'aviso', 'Lo pendiente de cobro (S/ 21.00) entra a la lista de pendientes y lleva a Fiados');
afirmar(construirParaHoy({ ...datos, totalPorCobrar: 0 }).length === 0 && construirParaHoy(datos).length === 0, 'Sin nada por cobrar no hay pendiente de cobro');
const conCobro = construirParaHoy({ ...datos, productosStockBajo: 2, totalPorCobrar: 50, respaldo: { pendiente: true, nunca: true, dias: null } });
afirmar(conCobro.map((p) => p.id).join(',') === 'cobro,stock,respaldo', 'Orden: por cobrar, Stock y Respaldo');
afirmar(textoResumenPendientes(conCobro.length) === 'Tienes 3 pendientes', 'El cobro cuenta en «Tienes N pendientes»');
const tarjetaTxt = readFileSync(path.join(__dirname, '..', 'src/components/tarjeta-para-hoy.tsx'), 'utf8').replace(/\r\n/g, '\n');
afirmar(tarjetaTxt.includes('<section aria-label="Pendientes" className="border-y border-linea py-3">') && tarjetaTxt.includes('>Pendientes</h2>') && tarjetaTxt.includes('text-bodega-oscuro'), '«Pendientes» tiene título turquesa y todo va dentro de las mismas dos líneas horizontales');
afirmar(tarjetaTxt.indexOf('>Pendientes</h2>') < tarjetaTxt.indexOf('textoResumenPendientes(pendientes.length)') && tarjetaTxt.indexOf('textoResumenPendientes(pendientes.length)') < tarjetaTxt.indexOf('{abierto && ('), 'Orden: título «Pendientes», debajo «Tienes N pendientes» y, al desplegar, el detalle');
afirmar(!inicio.includes('pendientes de cobro</p>') && inicio.includes('totalPorCobrar: resumenDelDia.totalPorCobrar'), 'Inicio ya no muestra el monto por cobrar suelto: va dentro de los pendientes');

// ---- «Ventas de los últimos 7 días»: título, texto y «Ver gráfico» dentro de las mismas líneas
const iTitulo = inicio.indexOf('Ventas de los últimos 7 días</h2>');
const iVer = inicio.indexOf('<span>Ver gráfico</span>');
const iGrafico = inicio.indexOf('graficoAbierto && (');
const iMasVendido = inicio.indexOf('Más vendido hoy');
afirmar(iTitulo > 0 && inicio.slice(Math.max(0, iTitulo - 200), iTitulo).includes('border-y border-linea') && iTitulo < iVer && iVer < iGrafico && iGrafico < iMasVendido, 'Título, texto y «Ver gráfico» comparten las mismas líneas horizontales; el gráfico se abre dentro de ellas y «Más vendido hoy» queda debajo');

console.log('🎉 Todas las pruebas de V4a pasaron.');
