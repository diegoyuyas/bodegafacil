/**
 * Vende Fácil — Tarjeta «Para hoy» de Inicio (lógica pura)
 * ------------------------------------------------------------
 * Junta lo que pide atención hoy (fiados vencidos, stock bajo, respaldo pendiente), con su texto y la
 * pantalla a la que lleva cada cosa. Sin UI ni base de datos: se prueba con `tsx`.
 * Las fechas son 'YYYY-MM-DD' en hora local; el «hoy» lo pone quien llama.
 */
import { formatearMonto } from './moneda';
import { diasEntre, esFechaValida } from './fiados-compromiso';

/** Fecha 'YYYY-MM-DD' del último respaldo manual (Más > Respaldo > Descargar respaldo completo). */
export const CLAVE_ULTIMO_RESPALDO_MANUAL = 'ultimo_respaldo_manual_fecha';

/** Se avisa cuando pasaron 2 días o más desde el último respaldo (automático o manual). */
export const DIAS_SIN_RESPALDO_AVISO = 2;

export interface EstadoRespaldo {
  pendiente: boolean;
  /** true si nunca se hizo un respaldo. */
  nunca: boolean;
  /** Días desde el último respaldo (automático o manual); null si nunca. */
  dias: number | null;
}

/**
 * ¿Falta hacer un respaldo? Cuenta el más reciente entre el automático y el manual.
 *  - Avisa a los 2 días o más sin respaldo (ayer todavía no), tenga o no el respaldo automático activado.
 *  - Una app sin datos todavía (`hayDatos` falso) no avisa nada.
 */
export function estadoRespaldo(datos: {
  hayDatos: boolean;
  ultimaAuto: string | null;
  ultimoManual: string | null;
  hoy: string;
}): EstadoRespaldo {
  const fechas = [datos.ultimaAuto, datos.ultimoManual].filter((f): f is string => f !== null && esFechaValida(f));
  const ultimo = fechas.length > 0 ? fechas.reduce((a, b) => (a >= b ? a : b)) : null;
  if (ultimo === null) return { pendiente: datos.hayDatos, nunca: true, dias: null };
  const dias = Math.max(0, diasEntre(ultimo, datos.hoy)); // un reloj atrasado no da días negativos
  const pendiente = datos.hayDatos && dias >= DIAS_SIN_RESPALDO_AVISO;
  return { pendiente, nunca: false, dias };
}

export type IdPendiente = 'cobro' | 'stock' | 'respaldo';

export interface PendienteHoy {
  id: IdPendiente;
  titulo: string;
  detalle: string;
  /** Pantalla a la que lleva al tocarlo. */
  href: string;
  /** alerta = rojo (dinero que no entra), aviso = dorado (conviene atenderlo). */
  tono: 'alerta' | 'aviso';
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

function textoDias(dias: number): string {
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

/** Lo que hay para hoy, en orden de importancia: lo pendiente de cobro, stock y respaldo. Vacío si todo está al día. */
export function construirParaHoy(datos: {
  productosStockBajo: number;
  /** Total que los clientes deben (fiados pendientes de cobro). 0 o sin dato = no hay pendiente. */
  totalPorCobrar?: number;
  respaldo: EstadoRespaldo;
  simboloMoneda: string;
}): PendienteHoy[] {
  const lista: PendienteHoy[] = [];

  if ((datos.totalPorCobrar ?? 0) > 0) {
    lista.push({
      id: 'cobro',
      titulo: `${formatearMonto(datos.totalPorCobrar ?? 0, datos.simboloMoneda)} pendientes de cobro`,
      detalle: 'Toca para cobrar.',
      href: '/fiados',
      tono: 'aviso',
    });
  }

  if (datos.productosStockBajo > 0) {
    lista.push({
      id: 'stock',
      titulo: `${plural(datos.productosStockBajo, 'producto', 'productos')} con stock bajo`,
      detalle: 'Revisa qué te falta reponer.',
      href: '/productos',
      tono: 'aviso',
    });
  }

  if (datos.respaldo.pendiente) {
    lista.push({
      id: 'respaldo',
      titulo: 'Falta hacer un respaldo',
      detalle: datos.respaldo.nunca
        ? 'Aún no tienes ningún respaldo de tus datos.'
        : `Tu último respaldo fue ${textoDias(datos.respaldo.dias ?? 0)}.`,
      href: '/mas/respaldo',
      tono: 'aviso',
    });
  }

  return lista;
}

/** Texto de la fila cerrada de «Para hoy»: «Tienes 3 pendientes», «Tienes 1 pendiente» o «Todo al día ✓». */
export function textoResumenPendientes(cantidad: number): string {
  if (cantidad <= 0) return 'Todo al día ✓';
  return cantidad === 1 ? 'Tienes 1 pendiente' : `Tienes ${cantidad} pendientes`;
}
