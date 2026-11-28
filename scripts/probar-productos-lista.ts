/**
 * Prueba de la mejora de «Productos»: chips (Insumo, Inactivo, Stock bajo), palabra «precio»/«costo» bajo el monto,
 * filtros Todos · Venta · Insumos, nombre a 2 líneas con «…» y pop-up con resumen y 3 botones en fila.
 * Lógica pura + revisión del código fuente (el aspecto real solo se ve en el celular).
 *
 * Uso: npx tsx scripts/probar-productos-lista.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  OPCIONES_FILTRO_TIPO,
  botonesOpcionesProducto,
  datosResumenProducto,
  esStockBajo,
  etiquetasProducto,
  nombreMontoProducto,
} from '../src/core/productos-lista';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const base = { tipo: 'venta_compra', activo: true, controlaStock: true, stockActual: 24, stockMinimo: 5 } as const;
const leer = (ruta: string) => readFileSync(path.join(__dirname, '..', ruta), 'utf8');

// ---- Etiquetas
afirmar(etiquetasProducto(base).length === 0, 'Un producto normal con stock suficiente no lleva etiquetas');
afirmar(etiquetasProducto({ ...base, tipo: 'insumo', controlaStock: false, stockActual: 0, stockMinimo: 0 }).join() === 'insumo', 'Un insumo lleva solo «Insumo» (aunque su stock sea 0)');
afirmar(etiquetasProducto({ ...base, activo: false }).join() === 'inactivo', 'Un producto inactivo lleva «Inactivo»');
afirmar(etiquetasProducto({ ...base, stockActual: 2 }).join() === 'stock_bajo', 'Con stock en el mínimo o debajo lleva «Stock bajo»');
afirmar(esStockBajo({ ...base, stockActual: 5 }) && !esStockBajo({ ...base, stockActual: 6 }), 'Stock bajo cuenta desde el mínimo (≤), no antes');
afirmar(!esStockBajo({ ...base, controlaStock: false, stockActual: 0, stockMinimo: 0 }), 'Si no controla stock, nunca es «Stock bajo»');
afirmar(etiquetasProducto({ ...base, activo: false, stockActual: 1 }).join() === 'inactivo,stock_bajo', 'Orden de las etiquetas: Insumo, Inactivo, Stock bajo');

// ---- Monto de la lista y resumen del pop-up
afirmar(nombreMontoProducto({ tipo: 'insumo' }) === 'costo' && nombreMontoProducto({ tipo: 'venta_compra' }) === 'precio', 'Bajo el monto: «costo» en insumos y «precio» en productos de venta');
afirmar(datosResumenProducto({ tipo: 'venta_compra' }).join() === 'precio,costo,stock', 'Pop-up de producto de venta: cuadros Precio, Costo y Stock');
afirmar(datosResumenProducto({ tipo: 'insumo' }).join() === 'costo', 'Pop-up de insumo: solo el cuadro Costo');

// ---- Botones del pop-up
afirmar(botonesOpcionesProducto({ tipo: 'venta_compra', controlaStock: true }).join() === 'editar,ajustar_stock,bitacora', 'Con stock: Editar | Ajustar stock | Bitácora');
afirmar(botonesOpcionesProducto({ tipo: 'venta_compra', controlaStock: false }).join() === 'editar,bitacora', 'Sin control de stock: solo Editar | Bitácora');
afirmar(botonesOpcionesProducto({ tipo: 'insumo', controlaStock: false }).join() === 'editar,bitacora', 'Un insumo: solo Editar | Bitácora');

// ---- Filtros
afirmar(OPCIONES_FILTRO_TIPO.map((o) => o.texto).join(' · ') === 'Todos · Venta · Insumos', 'Filtros en este orden: Todos · Venta · Insumos');
afirmar(OPCIONES_FILTRO_TIPO.map((o) => o.valor).join() === 'todos,venta_compra,insumo', 'Cada filtro usa el tipo correcto');

// ---- Pantalla (código fuente)
const pagina = leer('src/app/productos/page.tsx');
afirmar(pagina.includes('line-clamp-2') && !pagina.includes('partirEnLineas'), 'El nombre en la lista se corta a 2 líneas con «…» (ya no se parte cada 25 letras)');
afirmar(!pagina.includes('(Insumo)') && !pagina.includes('Costo:{'), 'Ya no hay «(Insumo)» pegado al nombre ni «Costo:» en el monto');
afirmar(pagina.includes('OPCIONES_FILTRO_TIPO.map') && !pagina.includes('Todos los productos'), 'El selector de tipo se cambió por 3 botones');
const iPopup = pagina.indexOf('aria-label={`Opciones de');
const iFin = pagina.indexOf('document.body', iPopup);
const popup = pagina.slice(iPopup, iFin);
afirmar(iPopup > 0 && !popup.includes('Cancelar'), 'El pop-up ya no tiene el botón «Cancelar»');
afirmar(pagina.includes('bg-black/40" onClick={() => setMenuOpcionesId(null)}'), 'Tocar fuera del pop-up lo sigue cerrando');
afirmar(pagina.includes("window.addEventListener('vendefacil:atras', cerrar)"), 'El botón «Atrás» sigue cerrando el pop-up');
afirmar(popup.includes('flex gap-2') && popup.includes('flex-1') && popup.includes('bg-bodega/10 text-bodega-oscuro'), 'Los botones van en fila; «Editar» con fondo turquesa suave y letra oscura');
afirmar(popup.includes('break-words') && !popup.includes('line-clamp'), 'En el pop-up el nombre se ve completo');
afirmar(popup.includes('min-h-12'), 'Cada botón del pop-up mide al menos 48 px de alto');

// ---- Saltos de línea (CRLF) en los archivos entregados
for (const ruta of ['src/app/productos/page.tsx', 'src/core/productos-lista.ts', 'scripts/probar-productos-lista.ts']) {
  const texto = leer(ruta);
  afirmar(!/(^|[^\r])\n/.test(texto), `${ruta}: todos los saltos de línea son CRLF`);
}

console.log('🎉 Todas las pruebas de la lista de Productos pasaron.');
