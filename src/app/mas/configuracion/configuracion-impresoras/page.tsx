'use client';

import Link from 'next/link';

/** Más > Configuración > Configuración de Impresión: lleva a las series de comprobantes y a la impresora. */
export default function PaginaConfiguracionImpresion() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas/configuracion" className="text-xl text-tinta-suave" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Configuración de Impresión</h1>
      </header>

      <ul className="mt-6 divide-y divide-linea border-y border-linea">
        <li>
          <Link
            href="/mas/configuracion/configuracion-impresoras/series"
            className="flex items-center justify-between gap-4 py-4"
          >
            <div>
              <p className="text-sm font-semibold text-tinta">Configuración de Series</p>
              <p className="mt-0.5 text-xs text-tinta-suave">
                Series de Boleta y Factura, y qué serie usa cada usuario.
              </p>
              <p className="mt-1 text-xs font-semibold text-acento-oscuro">Función Premium</p>
            </div>
            <span className="text-tinta-suave">›</span>
          </Link>
        </li>

        <li>
          <Link
            href="/mas/configuracion/configuracion-impresoras/sincronizar-impresora"
            className="flex items-center justify-between gap-4 py-4"
          >
            <div>
              <p className="text-sm font-semibold text-tinta">Sincronizar Impresora Bluetooth</p>
              <p className="mt-0.5 text-xs text-tinta-suave">Elegir la ticketera para imprimir los comprobantes.</p>
              <p className="mt-1 text-xs font-semibold text-acento-oscuro">Función Premium</p>
            </div>
            <span className="text-tinta-suave">›</span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
