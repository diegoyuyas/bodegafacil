import Link from 'next/link';
import { Tarjeta } from '@/components/ui/tarjeta';
import type { PendienteHoy } from '@/core/para-hoy';

/**
 * Tarjeta «Para hoy» de Inicio: lo que pide atención (fiados vencidos, stock bajo, respaldo) con un
 * acceso directo a cada cosa. Si no hay nada pendiente, una línea tranquila de «Todo al día».
 */
export function TarjetaParaHoy({ pendientes }: { pendientes: PendienteHoy[] }) {
  if (pendientes.length === 0) {
    return (
      <Tarjeta tono="ok" aria-label="Para hoy">
        <p className="text-sm font-bold text-ok">Todo al día ✓</p>
        <p className="mt-0.5 text-xs text-tinta-suave">No tienes nada pendiente por hoy.</p>
      </Tarjeta>
    );
  }
  return (
    <Tarjeta role="region" aria-label="Para hoy" className="p-0">
      <p className="px-4 pt-3 text-sm font-bold text-bodega-oscuro">Para hoy</p>
      <ul className="mt-1 divide-y divide-linea">
        {pendientes.map((p) => (
          <li key={p.id}>
            <Link href={p.href} className="flex items-center gap-3 px-4 py-3">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${p.tono === 'alerta' ? 'bg-alerta' : 'bg-acento'}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-tinta">{p.titulo}</span>
                <span className="block text-xs text-tinta-suave">{p.detalle}</span>
              </span>
              <span className="text-tinta-suave" aria-hidden="true">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}
