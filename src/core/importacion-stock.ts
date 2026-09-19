/**
 * Vende Fácil — Importación masiva de stock (Más > Importar Datos > Importar Stock masivo)
 * ------------------------------------------------------------
 * A diferencia de las otras importaciones, esta NO crea nada: solo
 * SUMA stock a productos que ya existen. Por eso el nombre del
 * producto en el Excel debe coincidir EXACTO (sin distinguir mayúsculas,
 * pero sí todo lo demás — tildes, espacios internos, etc.) con el
 * nombre guardado en el sistema; no hay coincidencia parcial ni
 * "parecido a" para evitar sumarle stock al producto equivocado. La
 * cantidad no puede ser negativa ni cero: esta pantalla solo sirve
 * para aumentar stock, nunca para descontarlo (eso ya existe en el
 * ajuste manual de Productos).
 */

import type { HojaExcel } from './exportacion';
import type { Producto } from './tipos';

export const ENCABEZADOS_IMPORTAR_STOCK = ['nombre_producto', 'cantidad_a_sumar'];

export function construirPlantillaImportarStock(): HojaExcel {
  return {
    nombre: 'Stock',
    encabezados: ENCABEZADOS_IMPORTAR_STOCK,
    filas: [['Inca Kola 500 ml', 24]],
  };
}

export interface DatosStockImportado {
  productoId: number;
  nombreProducto: string;
  cantidad: number;
}

export interface FilaImportadaStock {
  numeroFila: number;
  datos: DatosStockImportado | null;
  errores: string[];
}

function celdaVacia(valor: unknown): boolean {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

export function filaEstaVacia(valores: unknown[]): boolean {
  return valores.every(celdaVacia);
}

function aNumero(valor: unknown): number | null {
  if (celdaVacia(valor)) return null;
  const texto = String(valor).replace(',', '.').trim();
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : NaN;
}

/**
 * Convierte una fila cruda en el ajuste de stock a aplicar. Necesita
 * la lista completa de productos activos (`productos.listarActivos()`)
 * para resolver el nombre exacto al `id` que espera `ajustarStock`, y
 * para bloquear productos que no controlan stock (donde sumar no
 * tendría sentido: siempre quedan en 0).
 */
export function parsearFilaImportacionStock(
  valores: unknown[],
  numeroFila: number,
  productosExistentes: Producto[],
): FilaImportadaStock {
  const [nombreCrudo, cantidadCruda] = valores;
  const errores: string[] = [];

  const nombre = celdaVacia(nombreCrudo) ? '' : String(nombreCrudo).trim();
  if (!nombre) errores.push('El nombre del producto es obligatorio.');

  const cantidadNumero = aNumero(cantidadCruda);
  if (cantidadNumero === null) errores.push('La cantidad a sumar es obligatoria.');
  else if (Number.isNaN(cantidadNumero)) errores.push('La cantidad a sumar no es un número válido.');
  else if (cantidadNumero <= 0) {
    errores.push('La cantidad a sumar debe ser mayor que cero (no se admiten montos negativos).');
  }

  let producto: Producto | undefined;
  if (nombre) {
    // Coincidencia EXACTA (solo se ignora mayúsculas/minúsculas y
    // espacios al inicio/final) — a propósito, para no sumarle stock
    // al producto equivocado por un parecido de nombre.
    producto = productosExistentes.find((p) => p.nombre.trim().toLowerCase() === nombre.toLowerCase());
    if (!producto) {
      errores.push(`No existe un producto llamado exactamente "${nombre}" en el sistema.`);
    } else if (!producto.controlaStock) {
      errores.push(`"${nombre}" no controla stock, así que no se le puede sumar.`);
    }
  }

  if (errores.length > 0 || !producto || cantidadNumero === null || Number.isNaN(cantidadNumero)) {
    return { numeroFila, datos: null, errores };
  }

  return {
    numeroFila,
    errores: [],
    datos: { productoId: producto.id, nombreProducto: producto.nombre, cantidad: cantidadNumero },
  };
}
