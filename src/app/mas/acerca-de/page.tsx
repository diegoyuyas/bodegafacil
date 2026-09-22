'use client';

import Link from 'next/link';
import { VERSION_APP } from '@/core/version';

const WEB_ITECT = 'https://itectperu.com/';

const DATOS = [
  { etiqueta: 'Versión del App', valor: `v${VERSION_APP}` },
  { etiqueta: 'Sistema Operativo', valor: 'Android' },
  { etiqueta: 'Desarrollado por', valor: 'ITECT' },
];

export default function PaginaAcercaDe() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas" className="text-xl text-tinta/60" aria-label="Volver a Más">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Acerca de Vende Fácil</h1>
      </header>

      <div className="mt-6 flex items-center justify-center gap-4">
        <img
          src="/logo-vende-facil.png"
          alt="Vende Fácil"
          width={512}
          height={512}
          className="h-20 w-20"
        />
        <img
          src="/logo-itect.png"
          alt="ITECT"
          width={1023}
          height={1501}
          className="h-20 w-auto"
        />
      </div>

      <ul className="mt-6 divide-y divide-linea border-y border-linea">
        {DATOS.map((dato) => (
          <li key={dato.etiqueta} className="flex items-center justify-between py-4">
            <p className="text-sm font-semibold text-tinta">{dato.etiqueta}</p>
            <p className="text-sm text-tinta/60">{dato.valor}</p>
          </li>
        ))}

        <li className="flex items-center justify-between py-4">
          <p className="text-sm font-semibold text-tinta">Visita nuestra Web</p>
          <a
            href={WEB_ITECT}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-bodega-oscuro"
          >
            itectperu.com
          </a>
        </li>
      </ul>
    </div>
  );
}
