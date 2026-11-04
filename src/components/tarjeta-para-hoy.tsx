'use client';

import Link from 'next/link';
import { useState } from 'react';
import { textoResumenPendientes, type PendienteHoy } from '@/core/para-hoy';

/**
 * «Pendientes» de Inicio (fiados vencidos, lo pendiente de cobro, stock bajo, respaldo). Todo va dentro de las dos
 * líneas horizontales de la sección: el título «Pendientes» (turquesa) y debajo «Tienes N pendientes». Viene
 * PLEGADO; el detalle (cada pendiente con su acceso directo) aparece al desplegarlo, igual que el Historial de
 * ventas de antes. Sin pendientes queda «Todo al día ✓» (no hay nada que abrir).
 */
export function TarjetaParaHoy({ pendientes }: { pendientes: PendienteHoy[] }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <section aria-label="Pendientes" className="border-y border-linea py-3">
      <h2 className="text-sm font-bold text-bodega-oscuro">Pendientes</h2>
      {pendientes.length === 0 ? (
        <p className="mt-1 text-sm font-semibold text-ok">{textoResumenPendientes(0)}</p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="mt-1 flex w-full items-center justify-between text-sm font-semibold text-tinta"
          >
            <span>{textoResumenPendientes(pendientes.length)}</span>
            <span className={`text-tinta-suave transition-transform ${abierto ? 'rotate-180' : ''}`} aria-hidden="true">
              ⌄
            </span>
          </button>
          {abierto && (
            <ul className="mt-2 divide-y divide-linea">
              {pendientes.map((p) => (
                <li key={p.id}>
                  <Link href={p.href} className="flex items-center gap-3 py-3">
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
          )}
        </>
      )}
    </section>
  );
}
