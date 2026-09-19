'use client';

import Link from 'next/link';

const OPCIONES = [
  { href: '/mas/importar-datos/productos', etiqueta: 'Importar Productos', descripcion: 'Carga masiva desde una plantilla Excel (Premium)' },
  { href: '/mas/importar-datos/clientes', etiqueta: 'Importar Clientes', descripcion: 'Carga masiva de clientes con su documento (Premium)' },
  { href: '/mas/importar-datos/proveedores', etiqueta: 'Importar Proveedores', descripcion: 'Carga masiva de proveedores (Premium)' },
  { href: '/mas/importar-datos/stock', etiqueta: 'Importar Stock masivo', descripcion: 'Suma stock a productos ya existentes (Premium)' },
];

export default function PaginaImportarDatos() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Importar Datos</h1>
      </header>

      <ul className="mt-6 divide-y divide-linea border-y border-linea">
        {OPCIONES.map((opcion) => (
          <li key={opcion.href}>
            <Link href={opcion.href} className="flex items-center justify-between py-4">
              <div>
                <p className="text-sm font-semibold text-tinta">{opcion.etiqueta}</p>
                <p className="text-xs text-tinta/50">{opcion.descripcion}</p>
              </div>
              <span className="text-tinta/40">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
