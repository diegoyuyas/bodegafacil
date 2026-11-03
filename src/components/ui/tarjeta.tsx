import type { HTMLAttributes } from 'react';

/**
 * Tarjeta estándar (borde fino, esquinas redondeadas, 16 px de margen interno).
 * `tono` usa los colores con significado fijo: ok = verde, premium = dorado, alerta = rojo.
 */
export type TonoTarjeta = 'normal' | 'ok' | 'premium' | 'alerta';

const TONOS: Record<TonoTarjeta, string> = {
  normal: 'border-linea',
  ok: 'border-ok/40 bg-ok/5',
  premium: 'border-acento/50 bg-acento/10',
  alerta: 'border-alerta/40 bg-alerta/5',
};

export interface PropsTarjeta extends HTMLAttributes<HTMLDivElement> {
  tono?: TonoTarjeta;
}

export function Tarjeta({ tono = 'normal', className = '', ...resto }: PropsTarjeta) {
  return <div className={`rounded-xl border p-4 ${TONOS[tono]} ${className}`} {...resto} />;
}
