'use client';

import Link from 'next/link';
import { usarContenedor } from '@/hooks/usar-contenedor';
import type { ResumenDia } from '@/core/tipos';
import { useEffect, useState } from 'react';

/**
 * Pantalla de inicio — resumen del día (sección 7 del documento maestro),
 * ahora conectada a la base de datos local real vía el contenedor de
 * repositorios (Paso 3). Antes de esto, los números eran de ejemplo.
 */

const ETIQUETAS_METODO_PAGO: Record<string, string> = {
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  tarjeta: 'Tarjeta',
  fiado: 'Fiado',
};

function formatearSoles(monto: number): string {
  return `S/ ${monto.toFixed(2)}`;
}

export default function PaginaInicio() {
  const { contenedor, error, cargando } = usarContenedor();
  const [resumen, setResumen] = useState<ResumenDia | null>(null);

  useEffect(() => {
    if (!contenedor) return;
    setResumen(contenedor.ventas.resumenDelDia());
  }, [contenedor]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col">
      <header className="flex items-baseline justify-between px-5 pt-6">
        <h1 className="text-lg font-extrabold tracking-tight text-bodega-oscuro">
          Bodega Fácil
        </h1>
        <span className="text-sm text-tinta/60">
          {new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}
        </span>
      </header>

      <main className="flex-1 px-5 pb-28 pt-6">
        {cargando && <p className="text-sm text-tinta/60">Cargando tu bodega…</p>}
        {error && (
          <p className="text-sm text-alerta">
            No se pudo abrir la base de datos local: {error.message}
          </p>
        )}

        {resumen && (
          <>
            {/* Hero: lo primero que el bodeguero necesita saber */}
            <section aria-label="Resumen de ventas de hoy">
              <p className="text-sm text-tinta/60">Ventas de hoy</p>
              <p className="mt-1 text-5xl font-extrabold leading-none text-tinta">
                {formatearSoles(resumen.totalVentas)}
              </p>
              <p className="mt-2 text-sm text-bodega-oscuro">
                Ganancia estimada {formatearSoles(resumen.gananciaEstimada)} ·{' '}
                {resumen.numeroVentas} {resumen.numeroVentas === 1 ? 'venta' : 'ventas'}
              </p>
            </section>

            {/* Desglose por método de pago, con estilo de boleta */}
            <section aria-label="Ventas por método de pago" className="mt-8">
              {resumen.porMetodoPago.length === 0 ? (
                <p className="border-y border-linea py-4 text-sm text-tinta/50">
                  Todavía no registras ventas hoy.
                </p>
              ) : (
                <ul className="divide-y divide-linea border-y border-linea">
                  {resumen.porMetodoPago.map((fila) => (
                    <li
                      key={fila.metodo}
                      className="flex items-center justify-between py-3 text-sm"
                    >
                      <span className="text-tinta/80">
                        {ETIQUETAS_METODO_PAGO[fila.metodo] ?? fila.metodo}
                      </span>
                      <span className="font-semibold text-tinta">
                        {formatearSoles(fila.monto)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Alertas: solo lo que requiere atención hoy */}
            <section aria-label="Alertas" className="mt-6 space-y-3">
              {resumen.productosStockBajo > 0 && (
                <div className="flex items-start gap-3 text-sm">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-alerta" aria-hidden />
                  <p className="text-tinta/80">
                    <span className="font-semibold text-tinta">
                      {resumen.productosStockBajo} productos
                    </span>{' '}
                    con stock bajo
                  </p>
                </div>
              )}
              {resumen.totalPorCobrar > 0 && (
                <div className="flex items-start gap-3 text-sm">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-acento" aria-hidden />
                  <p className="text-tinta/80">
                    <span className="font-semibold text-tinta">
                      {formatearSoles(resumen.totalPorCobrar)}
                    </span>{' '}
                    pendientes de cobro
                  </p>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* Acción principal, alcanzable con el pulgar (diseño a una mano) */}
      <div className="fixed inset-x-0 bottom-16 mx-auto max-w-app px-5">
        <Link
          href="/ventas/nueva"
          className="flex h-14 items-center justify-center rounded-full bg-bodega text-base font-semibold text-white shadow-sm active:bg-bodega-oscuro"
        >
          Nueva venta
        </Link>
      </div>

      <BarraNavegacion />
    </div>
  );
}

function BarraNavegacion() {
  const enlaces = [
    { href: '/', etiqueta: 'Inicio', icono: IconoInicio },
    { href: '/productos', etiqueta: 'Productos', icono: IconoProductos },
    { href: '/fiados', etiqueta: 'Fiados', icono: IconoFiados },
    { href: '/mas', etiqueta: 'Más', icono: IconoMas },
  ];

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 mx-auto flex h-16 max-w-app border-t border-linea bg-papel"
    >
      {enlaces.map(({ href, etiqueta, icono: Icono }) => (
        <Link
          key={href}
          href={href}
          className="flex flex-1 flex-col items-center justify-center gap-1 text-tinta/60"
        >
          <Icono />
          <span className="text-[11px]">{etiqueta}</span>
        </Link>
      ))}
    </nav>
  );
}

function IconoInicio() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 11.5 12 5l8 6.5M6 10v8.5h4V14h4v4.5h4V10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconoProductos() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M4 8.5 12 13l8-4.5M12 13v7" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function IconoFiados() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 19c0-3.3 3.1-6 7-6s7 2.7 7 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconoMas() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}
