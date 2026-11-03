/**
 * Importe de dinero con jerarquía: el número grande y en negrita, el símbolo de moneda más chico.
 * Úsalo en lugar de `formatearMonto` cuando el importe es el protagonista (totales, saldos).
 * Los importes dentro de una frase de texto siguen usando `formatearMonto`.
 *
 * Los tonos siguen el significado fijo de los colores:
 *   ok = cobrado, alerta = deuda/vencido, premium = dorado, suave = secundario.
 */
export type TamanoMonto = 'mini' | 'normal' | 'mediano' | 'grande' | 'enorme';
export type TonoMonto = 'normal' | 'ok' | 'alerta' | 'premium' | 'suave';

const TAMANOS: Record<TamanoMonto, string> = {
  mini: 'text-sm',
  normal: 'text-base',
  mediano: 'text-lg',
  grande: 'text-3xl',
  enorme: 'text-5xl leading-none',
};

const TONOS: Record<TonoMonto, string> = {
  normal: 'text-tinta',
  ok: 'text-ok',
  alerta: 'text-alerta',
  premium: 'text-acento-oscuro',
  suave: 'text-tinta-suave',
};

export function Monto({
  valor,
  simbolo,
  tamano = 'normal',
  tono = 'normal',
  className = '',
}: {
  valor: number;
  simbolo: string;
  tamano?: TamanoMonto;
  tono?: TonoMonto;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-baseline gap-1 font-extrabold ${TAMANOS[tamano]} ${TONOS[tono]} ${className}`}>
      <span className="text-[0.55em] font-bold">{simbolo}</span>
      <span>{valor.toFixed(2)}</span>
    </span>
  );
}
