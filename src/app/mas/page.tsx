import Link from 'next/link';

const OPCIONES = [
  { href: '/caja', etiqueta: 'Caja', descripcion: 'Saldo, ingresos y egresos' },
  { href: '/compras', etiqueta: 'Compras', descripcion: 'Reponer stock desde un proveedor' },
  {
    href: '/mas/reportes',
    etiqueta: 'Reportes',
    descripcion: 'Caja, compras y más vendidos por rango de fechas (Premium)',
  },
  { href: '/mas/clientes', etiqueta: 'Clientes', descripcion: 'Guardar clientes con su documento' },
  { href: '/mas/proveedores', etiqueta: 'Proveedores', descripcion: 'Guardar proveedores con RUC y celular' },
  { href: '/mas/respaldo', etiqueta: 'Respaldo y exportación', descripcion: 'CSV, respaldo completo y restaurar' },
];

const PROXIMAMENTE = ['Configuración'];

export default function PaginaMas() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-xl text-tinta/60" aria-label="Volver a inicio">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Más</h1>
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

      <p className="mt-6 text-xs uppercase tracking-wide text-tinta/40">Próximamente</p>
      <ul className="mt-2 divide-y divide-linea border-y border-linea opacity-50">
        {PROXIMAMENTE.map((etiqueta) => (
          <li key={etiqueta} className="py-3 text-sm text-tinta/60">
            {etiqueta}
          </li>
        ))}
      </ul>
    </div>
  );
}
