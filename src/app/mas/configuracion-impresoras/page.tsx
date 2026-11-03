'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Ruta antigua: la impresora ahora se elige en Más > Configuración > Configuración de Impresión >
 * Sincronizar Impresora Bluetooth. Esta pantalla solo lleva hasta allá.
 */
export default function PaginaConfiguracionImpresorasAntigua() {
  const router = useRouter();
  const destino = '/mas/configuracion/configuracion-impresoras/sincronizar-impresora';

  useEffect(() => {
    router.replace(destino);
  }, [router]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <p className="text-sm text-tinta-suave">Llevándote a Sincronizar Impresora Bluetooth…</p>
      <Link href={destino} className="mt-3 text-sm font-semibold text-bodega-oscuro">
        Si no cambia sola, toca aquí
      </Link>
    </div>
  );
}
