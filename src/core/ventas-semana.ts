/**
 * Vende Fácil — Ventas de los últimos 7 días y producto más vendido del día (lógica pura)
 * ------------------------------------------------------------
 * Para el gráfico de Inicio. Agrupa por día de calendario LOCAL (las ventas se guardan con la hora
 * local del celular, 'YYYY-MM-DD HH:MM:SS'), así que el día no se corre por zona horaria. Los días sin
 * ventas aparecen con 0 (no se saltan) y las ventas anuladas no cuentan, igual que el total de Inicio.
 * Sin UI ni base de datos: se prueba con `tsx`.
 */
import { formatearMonto } from './moneda';
import { textoCantidadFraccion } from './venta-fraccion';
import { redondear } from './reglas-negocio';
import { nombreDiaSemanaCorto, sumarDias } from './fiados-compromiso';

export const DIAS_DEL_GRAFICO = 7;

/**
 * Una barra del gráfico de Inicio: un día (últimos 7 días) o un mes (ventas por mes). En los meses `fecha` es 'YYYY-MM',
 * `etiqueta` 'ene', 'feb'… y `esHoy` marca el mes actual.
 */
export interface DiaVentas {
  /** 'YYYY-MM-DD' (día) o 'YYYY-MM' (mes). */
  fecha: string;
  /** 'hoy' para el día de hoy; si no, 'lun', 'mar'… En los meses: 'ene', 'feb'… */
  etiqueta: string;
  /** Solo en los meses: el nombre completo ('marzo'). */
  nombre?: string;
  total: number;
  /** Cuántos pedidos (ventas no anuladas) hubo ese día o ese mes. */
  numeroVentas: number;
  esHoy: boolean;
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Los 12 meses del año de `hoy` (de enero a diciembre), con 0 en los meses sin ventas. `totales` viene de ventas.totalesPorMes. */
export function ventasPorMes(totales: { mes: string; total: number; numeroVentas: number }[], hoy: string): DiaVentas[] {
  const anio = hoy.slice(0, 4);
  const mesActual = hoy.slice(0, 7);
  const porMes = new Map(totales.map((t) => [t.mes, t]));
  return MESES_CORTOS.map((etiqueta, i) => {
    const clave = `${anio}-${String(i + 1).padStart(2, '0')}`;
    const datos = porMes.get(clave);
    return {
      fecha: clave,
      etiqueta,
      nombre: MESES_LARGOS[i],
      total: redondear(datos?.total ?? 0),
      numeroVentas: datos?.numeroVentas ?? 0,
      esHoy: clave === mesActual,
    };
  });
}

/** El monto de una barra con 2 decimales («85.40», «1234.50»). */
export function montoGrafico(monto: number): string {
  return (Math.round((monto + Number.EPSILON) * 100) / 100).toFixed(2);
}

/** «1 pedido», «0 pedidos», «12 pedidos». */
export function textoPedidos(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? 'pedido' : 'pedidos'}`;
}

// Medidas del gráfico (en unidades del SVG, que mide 320 de ancho).
export const GRAFICO_ANCHO = 320;
export const GRAFICO_MARGEN = 6;
/** Franja de arriba reservada para el mensaje flotante de pedidos (nada se dibuja ahí). */
export const GRAFICO_ZONA_MENSAJE = 30;
export const GRAFICO_ALTO_MAXIMO_BARRA = 84;
const GRAFICO_TAMANO_MONTO = 10;
/** Lo que mide un dígito, en proporción al tamaño de la letra (con un poco de holgura). */
const ANCHO_DIGITO = 0.6;

export interface DisposicionGrafico {
  anchoBarra: number;
  /** Distancia de centro a centro entre una barra y la siguiente. */
  casilla: number;
  /** true = los montos se escriben de pie (rotados) para que no se pasen a la barra vecina. */
  montosVerticales: boolean;
  tamanoMonto: number;
  /** Alto que ocupa el monto sobre la barra más alta. */
  altoMonto: number;
  baseY: number;
  alto: number;
}

/** ¿Los montos, escritos en horizontal, se pasarían de la casilla de su barra? Si sí, se escriben de pie. */
export function montosEnVertical(textos: string[], casilla: number, tamano: number = GRAFICO_TAMANO_MONTO): boolean {
  const mayor = Math.max(0, ...textos.map((t) => t.length));
  return mayor * tamano * ANCHO_DIGITO > casilla - 2;
}

/** Dónde va el mensaje flotante de pedidos sobre una barra: siempre dentro del gráfico, aunque la barra esté en un borde. */
export function posicionMensajePedidos(centro: number, texto: string): { x: number; ancho: number; punta: number } {
  const ancho = texto.length * 6.4 + 18;
  const x = Math.min(Math.max(centro - ancho / 2, 2), GRAFICO_ANCHO - ancho - 2);
  const punta = Math.min(Math.max(centro, x + 10), x + ancho - 10);
  return { x, ancho, punta };
}

/** Cómo se dibuja el gráfico según cuántas barras hay y qué tan largos son sus montos (2 decimales). */
export function calcularDisposicionGrafico(barras: DiaVentas[]): DisposicionGrafico {
  const n = barras.length;
  const anchoBarra = n > 8 ? 20 : 32;
  const separacion = n > 1 ? (GRAFICO_ANCHO - GRAFICO_MARGEN * 2 - anchoBarra * n) / (n - 1) : 0;
  const casilla = anchoBarra + separacion;
  const textos = barras.map((b) => (b.total > 0 ? montoGrafico(b.total) : ''));
  const montosVerticales = montosEnVertical(textos, casilla);
  const mayor = Math.max(0, ...textos.map((t) => t.length));
  const altoMonto = montosVerticales ? mayor * GRAFICO_TAMANO_MONTO * ANCHO_DIGITO + 6 : 14;
  const baseY = GRAFICO_ZONA_MENSAJE + altoMonto + GRAFICO_ALTO_MAXIMO_BARRA;
  return { anchoBarra, casilla, montosVerticales, tamanoMonto: GRAFICO_TAMANO_MONTO, altoMonto, baseY, alto: baseY + 32 };
}

/** Los últimos `dias` días terminando en `hoy`, del más viejo al más nuevo, con 0 en los días sin ventas. */
export function ventasUltimosDias(
  ventas: { fechaHora: string; total: number; anulada: boolean }[],
  hoy: string,
  dias: number = DIAS_DEL_GRAFICO,
): DiaVentas[] {
  const lista: DiaVentas[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const fecha = sumarDias(hoy, -i);
    lista.push({ fecha, etiqueta: i === 0 ? 'hoy' : nombreDiaSemanaCorto(fecha), total: 0, numeroVentas: 0, esHoy: i === 0 });
  }
  const porFecha = new Map(lista.map((d) => [d.fecha, d]));
  for (const venta of ventas) {
    if (venta.anulada) continue;
    const dia = porFecha.get(venta.fechaHora.slice(0, 10));
    if (!dia) continue;
    dia.total += venta.total;
    dia.numeroVentas += 1;
  }
  for (const d of lista) d.total = redondear(d.total);
  return lista;
}

export function totalDeLosDias(dias: DiaVentas[]): number {
  return redondear(dias.reduce((suma, d) => suma + d.total, 0));
}

/** El día con más ventas (null si ninguno vendió). En un empate gana el más reciente. */
export function mejorDia(dias: DiaVentas[]): DiaVentas | null {
  let mejor: DiaVentas | null = null;
  for (const d of dias) {
    if (d.total > 0 && (mejor === null || d.total >= mejor.total)) mejor = d;
  }
  return mejor;
}

/** Monto compacto para poner sobre cada barra: 85, 245, 1.2k, 12k. */
export function montoCorto(monto: number): string {
  const n = Math.round(monto);
  if (n < 1000) return String(n);
  const miles = n / 1000;
  return miles < 10 ? `${(Math.round(miles * 10) / 10).toString()}k` : `${Math.round(miles)}k`;
}

/** Altura (0 a 1) de cada barra respecto al día más alto. Un día con ventas nunca queda invisible (mínimo 4 %). */
export function alturaRelativa(total: number, maximo: number): number {
  if (!(total > 0) || !(maximo > 0)) return 0;
  return Math.max(0.04, Math.min(1, total / maximo));
}

/** Descripción del gráfico para lectores de pantalla. */
export function descripcionDelGrafico(dias: DiaVentas[], simboloMoneda: string, periodo: 'dias' | 'meses' = 'dias'): string {
  if (periodo === 'meses') {
    const totalAnio = totalDeLosDias(dias);
    if (totalAnio === 0) return 'Ventas por mes: todavía no hay ventas.';
    const mejorMes = mejorDia(dias);
    const anio = dias[0]?.fecha.slice(0, 4) ?? '';
    return `Ventas por mes de ${anio}: ${formatearMonto(totalAnio, simboloMoneda)} en total${
      mejorMes ? `, mejor mes ${mejorMes.nombre ?? mejorMes.etiqueta} con ${formatearMonto(mejorMes.total, simboloMoneda)}` : ''
    }.`;
  }
  const total = totalDeLosDias(dias);
  if (total === 0) return 'Ventas de los últimos 7 días: todavía no hay ventas.';
  const mejor = mejorDia(dias);
  const hoy = dias.find((d) => d.esHoy);
  const partes = [`Ventas de los últimos ${dias.length} días: ${formatearMonto(total, simboloMoneda)} en total`];
  if (hoy) partes.push(`hoy ${formatearMonto(hoy.total, simboloMoneda)}`);
  if (mejor) partes.push(`mejor día ${mejor.esHoy ? 'hoy' : mejor.etiqueta} con ${formatearMonto(mejor.total, simboloMoneda)}`);
  return `${partes.join(', ')}.`;
}

export interface ProductoMasVendido {
  producto: string;
  /** Producto por fracciones: en enteros equivalentes (1 caja y 8 unidades = 1.67 cajas), para compararlo con los demás. */
  cantidad: number;
  ingreso: number;
  /** Producto por fracciones: lo vendido como se lee, «1 caja y 8 unidades». */
  cantidadTexto?: string;
}

/**
 * El producto del que más unidades se vendieron. Empate: gana el que más dinero dejó; si aún empatan,
 * el nombre que va primero alfabéticamente (para que el resultado no cambie de un momento a otro).
 */
export function productoMasVendido(
  lineas: {
    producto: string;
    cantidad: number;
    precioUnitario?: number;
    /** Líneas por fracciones: unidades de stock que movió cada unidad de la línea (12 la caja, 1 la fracción). */
    factorStock?: number;
    fraccion?: { unidadEntera: string; unidadFraccion: string; factor: number } | null;
  }[],
): ProductoMasVendido | null {
  const porProducto = new Map<string, ProductoMasVendido>();
  // Lo vendido en unidades base de los productos por fracciones (cajas y unidades sueltas se cuentan juntas).
  const baseFraccion = new Map<string, { base: number; fraccion: { unidadEntera: string; unidadFraccion: string; factor: number } }>();
  for (const l of lineas) {
    if (!(l.cantidad > 0)) continue;
    const actual = porProducto.get(l.producto) ?? { producto: l.producto, cantidad: 0, ingreso: 0 };
    if (l.fraccion) {
      const base = l.cantidad * (l.factorStock ?? 1);
      actual.cantidad += base / l.fraccion.factor;
      const previa = baseFraccion.get(l.producto);
      baseFraccion.set(l.producto, { base: (previa?.base ?? 0) + base, fraccion: l.fraccion });
    } else {
      actual.cantidad += l.cantidad;
    }
    actual.ingreso += l.cantidad * (l.precioUnitario ?? 0);
    porProducto.set(l.producto, actual);
  }
  let mejor: ProductoMasVendido | null = null;
  for (const p of porProducto.values()) {
    p.cantidad = redondear(p.cantidad);
    p.ingreso = redondear(p.ingreso);
    const porFracciones = baseFraccion.get(p.producto);
    if (porFracciones) p.cantidadTexto = textoCantidadFraccion(Math.round(porFracciones.base), porFracciones.fraccion);
    if (
      mejor === null ||
      p.cantidad > mejor.cantidad ||
      (p.cantidad === mejor.cantidad && p.ingreso > mejor.ingreso) ||
      (p.cantidad === mejor.cantidad && p.ingreso === mejor.ingreso && p.producto.localeCompare(mejor.producto, 'es') < 0)
    ) {
      mejor = p;
    }
  }
  return mejor;
}

/** 12 → «12», 1.5 → «1.5», 0.25 → «0.25» (sin ceros de más). */
export function textoCantidad(cantidad: number): string {
  return String(redondear(cantidad));
}
