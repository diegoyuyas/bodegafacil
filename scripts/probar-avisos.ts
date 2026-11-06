/**
 * Prueba de los avisos de éxito y los estados de las listas (Etapa V3).
 * Lógica pura: no necesita celular.
 *
 * Uso: npx tsx scripts/probar-avisos.ts
 */
import { AVISOS, duracionAvisoMs, estadoLista, textoExito } from '../src/core/avisos';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

// ---- Textos de éxito
afirmar(textoExito('Venta guardada') === 'Venta guardada ✓', 'Éxito: «Venta guardada» lleva la marca ✓');
afirmar(textoExito('Venta guardada.') === 'Venta guardada ✓', 'Éxito: se quita el punto final');
afirmar(textoExito('Venta guardada ✓') === 'Venta guardada ✓', 'Éxito: no repite la marca si ya la trae');
afirmar(textoExito(textoExito('Pago registrado')) === 'Pago registrado ✓', 'Éxito: aplicarlo dos veces da lo mismo');
afirmar(textoExito('  Cliente guardado  ') === 'Cliente guardado ✓', 'Éxito: ignora espacios sobrantes');
afirmar(textoExito('') === '✓', 'Éxito: un texto vacío no rompe');
for (const [nombre, texto] of Object.entries(AVISOS)) {
  afirmar(textoExito(texto).endsWith(' ✓') && !texto.includes('✓') && !texto.endsWith('.'), `El aviso «${nombre}» queda como «${textoExito(texto)}»`);
}

// ---- Duración
afirmar(duracionAvisoMs('Venta guardada ✓') === 2200, 'Duración: un aviso corto dura 2.2 s');
afirmar(duracionAvisoMs('x'.repeat(60)) > 2200 && duracionAvisoMs('x'.repeat(60)) < 5000, 'Duración: uno largo dura más (se alcanza a leer)');
afirmar(duracionAvisoMs('x'.repeat(500)) === 5000, 'Duración: nunca más de 5 s');
afirmar(duracionAvisoMs('') === 2200, 'Duración: vacío usa el mínimo');

// ---- Estados de lista
afirmar(estadoLista({ cargando: true, total: 0, visibles: 0 }) === 'cargando', 'Lista: mientras carga se muestra el esqueleto (no «vacía»)');
afirmar(estadoLista({ cargando: true, total: 5, visibles: 5 }) === 'cargando', 'Lista: cargando manda aunque haya datos viejos');
afirmar(estadoLista({ cargando: false, total: 0, visibles: 0 }) === 'vacia', 'Lista: sin nada guardado es «vacía» (con acción para crear el primero)');
afirmar(estadoLista({ cargando: false, total: 8, visibles: 0 }) === 'sin_resultados', 'Lista: con datos pero la búsqueda no deja ninguno es «sin resultados»');
afirmar(estadoLista({ cargando: false, total: 8, visibles: 3 }) === 'lista', 'Lista: con algo para mostrar es la lista');
afirmar(estadoLista({ cargando: false, total: 1, visibles: 1 }) === 'lista', 'Lista: un solo elemento también es lista');


console.log('🎉 Todas las pruebas de V3 pasaron.');
