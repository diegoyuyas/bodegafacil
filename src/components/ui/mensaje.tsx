import type { ReactNode } from 'react';

/**
 * Mensaje de error, éxito, aviso o información. Mismo aspecto en toda la app.
 * El error se anuncia a lectores de pantalla como alerta; los demás como estado.
 */
export type TipoMensaje = 'error' | 'exito' | 'aviso' | 'info';

const TIPOS: Record<TipoMensaje, string> = {
  error: 'border-alerta/30 bg-alerta/5 text-alerta',
  exito: 'border-ok/30 bg-ok/5 text-ok',
  aviso: 'border-acento/50 bg-acento/10 text-acento-oscuro',
  info: 'border-linea bg-bodega-claro text-bodega-oscuro',
};

export function Mensaje({
  tipo = 'info',
  children,
  className = '',
}: {
  tipo?: TipoMensaje;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      role={tipo === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border px-3 py-2 text-sm font-medium ${TIPOS[tipo]} ${className}`}
    >
      {children}
    </p>
  );
}
