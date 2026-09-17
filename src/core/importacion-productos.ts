/**
 * Vende Fácil — Importación masiva de productos (Más > Importar Productos)
 * ------------------------------------------------------------
 * Función pura, sin dependencias de DOM ni de SQLite (mismo espíritu que
 * `reglas-negocio.ts`): recibe filas crudas leídas de un Excel (mismo
 * formato neutral `HojaExcel` que usa la exportación, ver
 * `core/exportacion.ts`) y decide qué se puede crear y qué no, aplicando
 * los valores por defecto pedidos. La lectura del archivo real (SheetJS)
 * vive en `infraestructura/exportacion/excel.ts`; la escritura en la base
 * vive en la pantalla, reutilizando `productos.crear(...)` que ya existía.
 */

import type { HojaExcel } from './exportacion';
import type { DatosNuevoProducto } from './repositorios';

export const ENCABEZADOS_IMPORTAR_PRODUCTOS = [
  'nombre_producto',
  'precio_venta',
  'costo',
  'stock_inicial',
  'stock_minimo',
  'control_stock',
];

/** Plantilla descargable: encabezados + una fila de ejemplo de cada caso (con y sin control de stock). */
export function construirPlantillaImportarProductos(): HojaExcel {
  return {
    nombre: 'Productos',
    encabezados: ENCABEZADOS_IMPORTAR_PRODUCTOS,
    filas: [
      ['Inca Kola 500 ml', 4.0, 2.8, 24, 6, 'SI'],
      ['Recarga Claro S/5', 5, 4.5, '', '', 'NO'],
    ],
  };
}

export interface FilaImportadaProducto {
  /** Número de fila tal como se ve en Excel (contando el encabezado como fila 1), para mostrarlo al usuario. */
  numeroFila: number;
  /** Listo para `productos.crear(...)` si no hubo errores; `null` si la fila no se puede importar. */
  datos: DatosNuevoProducto | null;
  errores: string[];
}

function celdaVacia(valor: unknown): boolean {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

/** `null` = celda vacía, `NaN` = tenía texto pero no es un número válido. */
function aNumero(valor: unknown): number | null {
  if (celdaVacia(valor)) return null;
  const texto = String(valor).replace(',', '.').trim();
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : NaN;
}

/** Una fila cuenta como vacía si TODAS sus celdas están vacías — se ignora en silencio, no es un error. */
export function filaEstaVacia(valores: unknown[]): boolean {
  return valores.every(celdaVacia);
}

/**
 * Convierte una fila cruda (mismo orden que ENCABEZADOS_IMPORTAR_PRODUCTOS)
 * en los datos para crear el producto. Reglas pedidas:
 * - nombre: obligatorio.
 * - precio_venta vacío → 1. costo vacío → 0.
 * - stock_minimo vacío → 1. stock_inicial vacío → 0.
 * - control_stock: "SI"/"NO" (sin distinguir mayúsculas); vacío → "SI".
 * - Si control_stock es "NO", stock_inicial y stock_minimo quedan en 0
 *   SIEMPRE, aunque el usuario haya escrito números.
 */
export function parsearFilaImportacion(valores: unknown[], numeroFila: number): FilaImportadaProducto {
  const [nombreCrudo, precioCrudo, costoCrudo, stockInicialCrudo, stockMinimoCrudo, controlCrudo] = valores;
  const errores: string[] = [];

  const nombre = celdaVacia(nombreCrudo) ? '' : String(nombreCrudo).trim();
  if (!nombre) errores.push('El nombre del producto es obligatorio.');

  const precioNumero = aNumero(precioCrudo);
  if (Number.isNaN(precioNumero)) errores.push('El precio de venta no es un número válido.');
  else if (precioNumero !== null && precioNumero < 0) errores.push('El precio de venta no puede ser negativo.');
  const precioVenta = precioNumero === null ? 1 : precioNumero;

  const costoNumero = aNumero(costoCrudo);
  if (Number.isNaN(costoNumero)) errores.push('El costo no es un número válido.');
  else if (costoNumero !== null && costoNumero < 0) errores.push('El costo no puede ser negativo.');
  const costo = costoNumero === null ? 0 : costoNumero;

  const textoControl = celdaVacia(controlCrudo) ? 'SI' : String(controlCrudo).trim().toUpperCase();
  let controlaStock = true;
  if (textoControl === 'SI') controlaStock = true;
  else if (textoControl === 'NO') controlaStock = false;
  else errores.push(`control_stock debe ser "SI" o "NO" (se recibió "${String(controlCrudo)}").`);

  const stockInicialNumero = aNumero(stockInicialCrudo);
  if (Number.isNaN(stockInicialNumero)) errores.push('El stock inicial no es un número válido.');
  else if (stockInicialNumero !== null && stockInicialNumero < 0) errores.push('El stock inicial no puede ser negativo.');

  const stockMinimoNumero = aNumero(stockMinimoCrudo);
  if (Number.isNaN(stockMinimoNumero)) errores.push('El stock mínimo no es un número válido.');
  else if (stockMinimoNumero !== null && stockMinimoNumero < 0) errores.push('El stock mínimo no puede ser negativo.');

  let stockActual = stockInicialNumero === null ? 0 : stockInicialNumero;
  let stockMinimo = stockMinimoNumero === null ? 1 : stockMinimoNumero;

  // No controla stock → los valores de stock se ignoran, aunque el usuario haya digitado algo.
  if (!controlaStock) {
    stockActual = 0;
    stockMinimo = 0;
  }

  if (errores.length > 0) {
    return { numeroFila, datos: null, errores };
  }

  return {
    numeroFila,
    errores: [],
    datos: {
      nombre,
      precioVenta,
      costo,
      stockActual,
      stockMinimo,
      controlaStock,
      unidadMedida: 'unidad',
    },
  };
}

/**
 * Segunda pasada, después de `parsearFilaImportacion`: marca como error las
 * filas cuyo nombre ya existe (en la base o repetido dentro del mismo
 * archivo), para no crear productos duplicados. Recibe los nombres ya
 * existentes como `Set` (en minúsculas y sin espacios) — quien la llama es
 * responsable de traerlos de `productos.listarTodos()`; esta función sigue
 * sin tocar la base de datos.
 */
export function marcarDuplicados(
  filas: FilaImportadaProducto[],
  nombresExistentes: Set<string>,
): FilaImportadaProducto[] {
  const vistosEnElArchivo = new Set<string>();

  return filas.map((fila) => {
    if (!fila.datos) return fila; // ya tenía error de otro tipo, se deja como está

    const clave = fila.datos.nombre.trim().toLowerCase();

    if (nombresExistentes.has(clave)) {
      return {
        ...fila,
        datos: null,
        errores: [`Ya existe un producto llamado "${fila.datos.nombre}".`],
      };
    }

    if (vistosEnElArchivo.has(clave)) {
      return {
        ...fila,
        datos: null,
        errores: [`"${fila.datos.nombre}" está repetido dentro de este mismo archivo.`],
      };
    }

    vistosEnElArchivo.add(clave);
    return fila;
  });
}
