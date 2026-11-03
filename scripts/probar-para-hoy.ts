/**
 * Prueba de la tarjeta «Para hoy» de Inicio (Etapa V4a): qué avisa y cuándo, el respaldo pendiente,
 * y a qué pantalla lleva cada cosa. Lógica pura: no necesita celular.
 *
 * Uso: npx tsx scripts/probar-para-hoy.ts
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { construirParaHoy, estadoRespaldo, type EstadoRespaldo } from '../src/core/para-hoy';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const hoy = '2026-10-31';
const base = { hayDatos: true, autoActivo: false, frecuenciaDias: 1, ultimaAuto: null, ultimoManual: null, hoy };

// ---- Respaldo pendiente
afirmar(estadoRespaldo({ ...base, hayDatos: false }).pendiente === false, 'Una app sin datos todavía no avisa de respaldo');
const nunca = estadoRespaldo(base);
afirmar(nunca.pendiente && nunca.nunca && nunca.dias === null, 'Con datos y sin ningún respaldo: pendiente («nunca»)');
afirmar(estadoRespaldo({ ...base, ultimoManual: '2026-10-31' }).pendiente === false, 'Respaldo manual de hoy: nada pendiente');
afirmar(estadoRespaldo({ ...base, ultimoManual: '2026-10-25' }).pendiente === false, 'Sin automático, 6 días desde el último: todavía no avisa');
const sieteDias = estadoRespaldo({ ...base, ultimoManual: '2026-10-24' });
afirmar(sieteDias.pendiente && sieteDias.dias === 7 && !sieteDias.nunca, 'Sin automático, a los 7 días avisa (hace 7 días)');
afirmar(estadoRespaldo({ ...base, ultimaAuto: '2026-09-01', ultimoManual: '2026-10-30' }).pendiente === false, 'Cuenta el más reciente: un manual de ayer cubre un automático viejo');
afirmar(estadoRespaldo({ ...base, ultimaAuto: '2026-10-30', ultimoManual: '2026-08-01' }).dias === 1, 'Cuenta el más reciente: un automático de ayer cubre un manual viejo');
const auto = { ...base, autoActivo: true, frecuenciaDias: 3 };
afirmar(estadoRespaldo({ ...auto, ultimaAuto: '2026-10-28' }).pendiente === false, 'Con automático cada 3 días: a los 3 días no avisa (la app lo hace al abrirse)');
afirmar(estadoRespaldo({ ...auto, ultimaAuto: '2026-10-27' }).pendiente === true, 'Con automático cada 3 días: a los 4 días se pasó y avisa');
afirmar(estadoRespaldo({ ...auto, ultimaAuto: '2026-10-27', ultimoManual: '2026-10-31' }).pendiente === false, 'Con automático atrasado, un respaldo manual de hoy lo resuelve');
afirmar(estadoRespaldo({ ...base, ultimoManual: '2026-11-15' }).dias === 0 && estadoRespaldo({ ...base, ultimoManual: '2026-11-15' }).pendiente === false, 'Un reloj atrasado (fecha futura) no da días negativos ni avisa');
afirmar(estadoRespaldo({ ...base, ultimaAuto: 'basura', ultimoManual: null }).nunca === true, 'Una fecha mal escrita se ignora');
afirmar(estadoRespaldo({ ...auto, frecuenciaDias: Number.NaN, ultimaAuto: '2026-10-29' }).pendiente === true, 'Una frecuencia inválida se trata como diaria (no rompe)');
afirmar(estadoRespaldo({ ...base, ultimoManual: '2026-12-31', hoy: '2027-01-02' }).dias === 2, 'Cambio de año: del 31/12 al 02/01 son 2 días');

// ---- Tarjeta
const sinPendiente: EstadoRespaldo = { pendiente: false, nunca: false, dias: 1 };
const datos = { productosStockBajo: 0, clientesVencidos: 0, montoVencido: 0, compromisosVencidos: 0, respaldo: sinPendiente, simboloMoneda: 'S/' };
afirmar(construirParaHoy(datos).length === 0, 'Sin nada pendiente la lista queda vacía («Todo al día»)');

const soloStock = construirParaHoy({ ...datos, productosStockBajo: 3 });
afirmar(soloStock.length === 1 && soloStock[0]?.titulo === '3 productos con stock bajo' && soloStock[0]?.href === '/productos', 'Stock bajo: «3 productos con stock bajo» → Productos');
afirmar(construirParaHoy({ ...datos, productosStockBajo: 1 })[0]?.titulo === '1 producto con stock bajo', 'Stock bajo en singular: «1 producto con stock bajo»');

const fiados = construirParaHoy({ ...datos, clientesVencidos: 2, montoVencido: 120.5 })[0];
afirmar(fiados?.id === 'fiados' && fiados.titulo === '2 clientes con deuda vencida' && fiados.detalle.includes('S/ 120.50') && fiados.href === '/fiados' && fiados.tono === 'alerta', 'Fiados vencidos: «2 clientes con deuda vencida», con el monto, rojo → Fiados');
afirmar(construirParaHoy({ ...datos, clientesVencidos: 1, montoVencido: 10 })[0]?.titulo === '1 cliente con deuda vencida', 'Fiados en singular: «1 cliente con deuda vencida»');
const soloCompromisos = construirParaHoy({ ...datos, compromisosVencidos: 3 })[0];
afirmar(soloCompromisos?.titulo === '3 compromisos de pago pasados' && !soloCompromisos.detalle.includes('Vencido:'), 'Solo compromisos pasados: texto propio y sin monto vencido');
afirmar(construirParaHoy({ ...datos, compromisosVencidos: 1 })[0]?.titulo === '1 compromiso de pago pasado', 'Compromiso en singular: «1 compromiso de pago pasado»');
afirmar(construirParaHoy({ ...datos, clientesVencidos: 2, montoVencido: 50, compromisosVencidos: 1 })[0]?.titulo === '2 clientes con deuda vencida y 1 compromiso de pago pasado', 'Las dos cosas juntas van en un solo aviso de Fiados');

const nuncaResp = construirParaHoy({ ...datos, respaldo: { pendiente: true, nunca: true, dias: null } })[0];
afirmar(nuncaResp?.id === 'respaldo' && nuncaResp.detalle === 'Aún no tienes ningún respaldo de tus datos.' && nuncaResp.href === '/mas/respaldo', 'Respaldo nunca hecho: texto claro → Respaldo');
afirmar(construirParaHoy({ ...datos, respaldo: { pendiente: true, nunca: false, dias: 9 } })[0]?.detalle === 'Tu último respaldo fue hace 9 días.', 'Respaldo atrasado: «Tu último respaldo fue hace 9 días.»');
afirmar(construirParaHoy({ ...datos, respaldo: { pendiente: true, nunca: false, dias: 1 } })[0]?.detalle === 'Tu último respaldo fue ayer.', 'Respaldo de ayer: «fue ayer»');

const todo = construirParaHoy({ ...datos, productosStockBajo: 2, clientesVencidos: 1, montoVencido: 30, respaldo: { pendiente: true, nunca: true, dias: null } });
afirmar(todo.map((p) => p.id).join(',') === 'fiados,stock,respaldo', 'Con todo pendiente, el orden es Fiados, Stock y Respaldo');
afirmar(new Set(todo.map((p) => p.href)).size === 3, 'Cada aviso lleva a una pantalla distinta');
for (const p of todo) {
  const archivo = path.join(__dirname, '..', 'src/app', p.href, 'page.tsx');
  afirmar(existsSync(archivo), `El acceso directo ${p.href} existe como pantalla`);
}
afirmar(todo.every((p) => (p.id === 'fiados' ? p.tono === 'alerta' : p.tono === 'aviso')), 'Fiados va en rojo y stock/respaldo en dorado');

console.log('🎉 Todas las pruebas de V4a pasaron.');
