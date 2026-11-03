'use client';

import type { ReactNode } from 'react';

/**
 * Áreas y reportes de Más > Reportes. Agregar un reporte nuevo = agregar una
 * línea en `reportes` del área que corresponda (y su sección en page.tsx).
 *  - `premium`: el reporte completo es Premium (se muestra con candado si no lo hay).
 *  - `usaRango`: false = muestra la situación de hoy y no pide rango de fechas.
 */
export const AREAS = [
  {
    id: 'ventas',
    titulo: 'Ventas',
    descripcion: 'Qué vendes y cuánto',
    reportes: [
      { valor: 'ventas', etiqueta: 'Resumen de Ventas', descripcion: 'Pedidos, productos y formas de pago', premium: false, usaRango: true },
      { valor: 'productos', etiqueta: 'Productos Más Vendidos', descripcion: 'Ranking por cantidad vendida', premium: false, usaRango: true },
      { valor: 'ganancia', etiqueta: 'Ganancia por Producto', descripcion: 'Qué productos te dejan más ganancia', premium: false, usaRango: true },
      { valor: 'formaspago', etiqueta: 'Ventas por Forma de Pago', descripcion: 'Efectivo, Yape, Plin, tarjeta y fiado', premium: false, usaRango: true },
      { valor: 'compradores', etiqueta: 'Clientes que Más Compran', descripcion: 'Tus mejores clientes del periodo', premium: false, usaRango: true },
    ],
  },
  {
    id: 'fiados',
    titulo: 'Fiados',
    descripcion: 'Deudas de tus clientes',
    reportes: [
      { valor: 'antiguedad', etiqueta: 'Deuda por Antigüedad', descripcion: 'Cuánto te deben y hace cuántos días', premium: false, usaRango: false },
      { valor: 'deudores', etiqueta: 'Clientes que Más Deben', descripcion: 'Ranking de deuda pendiente', premium: false, usaRango: false },
      { valor: 'anulaciones', etiqueta: 'Anulaciones', descripcion: 'Pagos de fiado anulados', premium: false, usaRango: true },
    ],
  },
  {
    id: 'compras',
    titulo: 'Compras',
    descripcion: 'Lo que compras a proveedores',
    reportes: [
      { valor: 'compras', etiqueta: 'Resumen de Compras', descripcion: 'Compras, proveedores y totales', premium: false, usaRango: true },
      { valor: 'costos', etiqueta: 'Costos x Producto', descripcion: 'Cuánto costó cada vez que se compró', premium: true, usaRango: true },
    ],
  },
  {
    id: 'inventario',
    titulo: 'Inventario',
    descripcion: 'Movimientos de tu stock',
    reportes: [
      { valor: 'kardex', etiqueta: 'Kardex', descripcion: 'Entradas, salidas y ajustes por producto', premium: false, usaRango: true },
    ],
  },
  {
    id: 'caja',
    titulo: 'Caja',
    descripcion: 'Ingresos y egresos de dinero',
    reportes: [
      { valor: 'caja', etiqueta: 'Reporte de Caja', descripcion: 'Movimientos por forma de pago', premium: false, usaRango: true },
    ],
  },
] as const;

export type Pestana = (typeof AREAS)[number]['reportes'][number]['valor'];

export const TODOS_LOS_REPORTES = AREAS.flatMap(
  (a) => a.reportes as readonly { valor: Pestana; etiqueta: string; usaRango: boolean }[],
);

const ICONOS: Record<(typeof AREAS)[number]['id'], ReactNode> = {
  // Bolsa de compras
  ventas: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 8h14l-1 11H6L5 8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 8V7a3 3 0 0 1 6 0v1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  // Dos personas
  fiados: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 19c.5-3 2.7-4.5 5.5-4.5s5 1.5 5.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15.5 6.2a3 3 0 0 1 0 5.6M17 14.8c1.9.5 3.1 2 3.5 4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  // Carrito
  compras: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3.5 5h2.2l1.8 9.5h9.3l1.7-7H7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.5" cy="18.5" r="1.2" fill="currentColor" />
      <circle cx="16.5" cy="18.5" r="1.2" fill="currentColor" />
    </svg>
  ),
  // Caja de inventario
  inventario: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 8 12 4l8 4v8l-8 4-8-4V8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M4 8l8 4 8-4M12 12v8" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  // Billetera
  caja: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="8.5" width="16" height="10.5" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="13.7" r="1.1" fill="currentColor" />
    </svg>
  ),
};

interface MenuReportesProps {
  esPremium: boolean;
  busqueda: string;
  onBusqueda: (texto: string) => void;
  onElegir: (reporte: Pestana) => void;
}

/** Pantalla principal de Reportes: una tarjeta por área, con sus reportes adentro. */
export function MenuReportes({ esPremium, busqueda, onBusqueda, onElegir }: MenuReportesProps) {
  const texto = busqueda.trim().toLowerCase();
  const areasVisibles = AREAS.map((area) => ({
    ...area,
    reportes: area.reportes.filter(
      (r) =>
        !texto ||
        r.etiqueta.toLowerCase().includes(texto) ||
        r.descripcion.toLowerCase().includes(texto) ||
        area.titulo.toLowerCase().includes(texto),
    ),
  })).filter((area) => area.reportes.length > 0);

  return (
    <div className="mt-4">
      <input
        value={busqueda}
        onChange={(e) => onBusqueda(e.target.value)}
        placeholder="Buscar reporte…"
        className="h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
      />

      {areasVisibles.length === 0 ? (
        <p className="mt-4 border-y border-linea py-6 text-center text-sm text-tinta-suave">
          Ningún reporte coincide con &quot;{busqueda}&quot;.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {areasVisibles.map((area) => (
            <section key={area.id} className="overflow-hidden rounded-2xl border border-linea">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bodega/10 text-bodega-oscuro">
                  {ICONOS[area.id]}
                </span>
                <div>
                  <h2 className="text-base font-extrabold text-bodega-oscuro">{area.titulo}</h2>
                  <p className="text-xs text-tinta-suave">{area.descripcion}</p>
                </div>
              </div>
              <ul className="divide-y divide-linea border-t border-linea">
                {area.reportes.map((r) => (
                  <li key={r.valor}>
                    <button
                      onClick={() => onElegir(r.valor)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-papel"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-tinta">
                          {r.etiqueta}
                          {r.premium && !esPremium && <span className="ml-2 text-xs">🔒</span>}
                        </span>
                        <span className="block text-xs text-tinta-suave">{r.descripcion}</span>
                      </span>
                      <span className="text-lg text-tinta/30" aria-hidden>
                        ›
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
