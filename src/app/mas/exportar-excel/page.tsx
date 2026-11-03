'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Ruta antigua: «Exportar todo a Excel» ahora está en Más > Respaldo y exportación. Esta pantalla solo lleva hasta allá. */
export default function PaginaExportarExcelAntigua() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/mas/respaldo');
  }, [router]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <p className="text-sm text-tinta-suave">Llevándote a Respaldo y exportación…</p>
      <Link href="/mas/respaldo" className="mt-3 text-sm font-semibold text-bodega-oscuro">
        Si no cambia sola, toca aquí
      </Link>
    </div>
  );
}
