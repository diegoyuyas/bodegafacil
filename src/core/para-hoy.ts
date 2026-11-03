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

/** Sin respaldo automático, se avisa cuando pasaron 7 días o más desde el último respaldo. */
export const DIAS_SIN_RESPALDO_AVISO = 7;

export interface EstadoRespaldo {
  pendiente: boolean;
  /** true si nunca se hizo un respaldo. */
  nunca: boolean;
  /** Días desde el último respaldo (automático o manual); null si nunca. */
  dias: number | null;
}

/**
 * ¿Falta hacer un respaldo? Cuenta el más reciente entre el automático y el manual.
 *  - Con respaldo automático activo solo avisa si se pasó de su frecuencia (si no, la app lo hace sola al abrirse).
 *  - Sin automático avisa a los 7 días.
 *  - Una app sin datos todavía (`hayDatos` falso) no avisa nada.
 */
export function estadoRespaldo(datos: {
  hayDatos: boolean;
  autoActivo: boolean;
  frecuenciaDias: number;
  ultimaAuto: string | null;
  ultimoManual: string | null;
  hoy: string;
}): EstadoRespaldo {
  const fechas = [datos.ultimaAuto, datos.ultimoManual].filter((f): f is string => f !== null && esFechaValida(f));
  const ultimo = fechas.length > 0 ? fechas.reduce((a, b) => (a >= b ? a : b)) : null;
  if (ultimo === null) return { pendiente: datos.hayDatos, nunca: true, dias: null };
  const dias = Math.max(0, diasEntre(ultimo, datos.hoy)); // un reloj atrasado no da días negativos
  const frecuencia = Number.isFinite(datos.frecuenciaDias) && datos.frecuenciaDias >= 1 ? datos.frecuenciaDias : 1;
  const pendiente = datos.hayDatos && (datos.autoActivo ? dias > frecuencia : dias >= DIAS_SIN_RESPALDO_AVISO);
  return { pendiente, nunca: false, dias };
}

export type IdPendiente = 'fiados' | 'stock' | 'respaldo';

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

/** Lo que hay para hoy, en orden de importancia: fiados, stock y respaldo. Vacío si todo está al día. */
export function construirParaHoy(datos: {
  productosStockBajo: number;
  clientesVencidos: number;
  montoVencido: number;
  compromisosVencidos: number;
  respaldo: EstadoRespaldo;
  simboloMoneda: string;
}): PendienteHoy[] {
  const lista: PendienteHoy[] = [];

  if (datos.clientesVencidos > 0 || datos.compromisosVencidos > 0) {
    const partes: string[] = [];
    if (datos.clientesVencidos > 0) partes.push(`${plural(datos.clientesVencidos, 'cliente', 'clientes')} con deuda vencida`);
    if (datos.compromisosVencidos > 0) {
      partes.push(`${plural(datos.compromisosVencidos, 'compromiso de pago pasado', 'compromisos de pago pasados')}`);
    }
    lista.push({
      id: 'fiados',
      titulo: partes.join(' y '),
      detalle:
        datos.clientesVencidos > 0
          ? `Vencido: ${formatearMonto(datos.montoVencido, datos.simboloMoneda)}. Toca para cobrar.`
          : 'Toca para recordarles su pago.',
      href: '/fiados',
      tono: 'alerta',
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
