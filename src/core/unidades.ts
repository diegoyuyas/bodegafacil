/**
 * Vende Fácil — Unidades de venta (Venta Entero/Fracción)
 * ------------------------------------------------------------
 * Lista única de unidades: sirve igual para la unidad ENTERA (Caja, Kg) y para la unidad FRACCIÓN
 * (Unidad, Gramo) de un producto. Lógica pura: sin UI ni base de datos.
 */

export interface UnidadVenta {
  /** Como se guarda y se muestra al elegirla ("Caja"). */
  nombre: string;
  /** Para escribir una cantidad de 1 ("1 caja"). */
  singular: string;
  /** Para escribir cualquier otra cantidad ("20 cajas"). */
  plural: string;
}

export const UNIDADES_VENTA: readonly UnidadVenta[] = [
  { nombre: 'Caja', singular: 'caja', plural: 'cajas' },
  { nombre: 'Unidad', singular: 'unidad', plural: 'unidades' },
  { nombre: 'Display', singular: 'display', plural: 'displays' },
  { nombre: 'Botella', singular: 'botella', plural: 'botellas' },
  { nombre: 'Kg', singular: 'kg', plural: 'kg' },
  { nombre: 'Gramo', singular: 'gramo', plural: 'gramos' },
  { nombre: 'Litro', singular: 'litro', plural: 'litros' },
  { nombre: 'Mililitro', singular: 'mililitro', plural: 'mililitros' },
  { nombre: 'Paquete', singular: 'paquete', plural: 'paquetes' },
  { nombre: 'Bolsa', singular: 'bolsa', plural: 'bolsas' },
  { nombre: 'Lata', singular: 'lata', plural: 'latas' },
  { nombre: 'Rollo', singular: 'rollo', plural: 'rollos' },
  { nombre: 'Docena', singular: 'docena', plural: 'docenas' },
  { nombre: 'Jaba', singular: 'jaba', plural: 'jabas' },
  { nombre: 'Bandeja', singular: 'bandeja', plural: 'bandejas' },
  { nombre: 'Saco', singular: 'saco', plural: 'sacos' },
  { nombre: 'Sobre', singular: 'sobre', plural: 'sobres' },
  { nombre: 'Galón', singular: 'galón', plural: 'galones' },
  { nombre: 'Libra', singular: 'libra', plural: 'libras' },
  { nombre: 'Metro', singular: 'metro', plural: 'metros' },
  { nombre: 'Par', singular: 'par', plural: 'pares' },
];

/** Solo los nombres, en el orden en que se muestran al elegir. */
export const NOMBRES_UNIDADES: readonly string[] = UNIDADES_VENTA.map((u) => u.nombre);

/** Devuelve la unidad de la lista (sin importar mayúsculas), o undefined si no está. */
export function buscarUnidad(nombre: string | null | undefined): UnidadVenta | undefined {
  if (!nombre) return undefined;
  const buscado = nombre.trim().toLowerCase();
  return UNIDADES_VENTA.find((u) => u.nombre.toLowerCase() === buscado);
}

export function esUnidadValida(nombre: string | null | undefined): boolean {
  return buscarUnidad(nombre) !== undefined;
}

/**
 * Nombre de la unidad para ponerlo junto a un número: singular si es exactamente 1, plural en los demás casos
 * (incluido 0). Una unidad que no está en la lista se devuelve tal cual, en minúsculas.
 */
export function textoUnidad(nombre: string, cantidad: number): string {
  const unidad = buscarUnidad(nombre);
  if (!unidad) return nombre.trim().toLowerCase();
  return cantidad === 1 ? unidad.singular : unidad.plural;
}

/**
 * Lo que se escribe después de una cantidad en una línea de venta: " caja", " unidades"… Vacío si la línea no tiene
 * unidad (las ventas de siempre), así «2 × GASEOSA» no cambia.
 */
export function sufijoUnidad(unidad: string | null | undefined, cantidad: number): string {
  return unidad ? ` ${textoUnidad(unidad, cantidad)}` : '';
}

/** Cuántas fracciones trae un entero cuando es casi seguro (se rellena solo; el usuario lo puede cambiar). */
const FACTORES_SUGERIDOS: Readonly<Record<string, number>> = {
  'Kg>Gramo': 1000,
  'Litro>Mililitro': 1000,
  'Docena>Unidad': 12,
  'Par>Unidad': 2,
};

/** Cuántas fracciones trae un entero, si el par de unidades tiene un valor seguro (Kg→Gramo = 1000); si no, null. */
export function factorSugerido(unidadEntera: string, unidadFraccion: string): number | null {
  const entera = buscarUnidad(unidadEntera);
  const fraccion = buscarUnidad(unidadFraccion);
  if (!entera || !fraccion) return null;
  return FACTORES_SUGERIDOS[`${entera.nombre}>${fraccion.nombre}`] ?? null;
}
