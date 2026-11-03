'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';
import { ACCESOS_BARRA, esAccesoActivo, mostrarBarraInferior, type IdAcceso } from '@/core/navegacion';
import { usarDesfaseViewport } from '@/hooks/usar-desfase-viewport';
import { usarEscribiendo } from '@/hooks/usar-escribiendo';
import {
  IconoClientes,
  IconoInicio,
  IconoMas,
  IconoProductos,
  IconoVenta,
  type PropsIcono,
} from '@/components/ui/iconos';

const ICONOS: Record<IdAcceso, ComponentType<PropsIcono>> = {
  inicio: IconoInicio,
  venta: IconoVenta,
  productos: IconoProductos,
  clientes: IconoClientes,
  mas: IconoMas,
};

/**
 * Barra de navegación inferior de las pantallas principales (Inicio, Productos, Clientes, Más).
 * Vive en el layout para que sea la misma en todas; se oculta sola en formularios, en la venta en
 * curso y mientras se escribe (con el teclado abierto). Respeta la barra de gestos de Android con
 * `--area-segura-abajo`.
 */
export function BarraInferior() {
  const pathname = usePathname();
  const escribiendo = usarEscribiendo();
  usarDesfaseViewport();

  if (!mostrarBarraInferior(pathname) || escribiendo) return null;

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-[var(--desfase-viewport-abajo,0px)] z-30 mx-auto max-w-app border-t border-linea bg-papel pb-[var(--area-segura-abajo)]"
    >
      <ul className="flex h-16">
        {ACCESOS_BARRA.map((acceso) => {
          const Icono = ICONOS[acceso.id];
          const activo = esAccesoActivo(acceso.href, pathname);
          const esVenta = acceso.id === 'venta';
          return (
            <li key={acceso.id} className="flex flex-1">
              <Link
                href={acceso.href}
                aria-current={activo ? 'page' : undefined}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 ${
                  activo || esVenta ? 'text-bodega-oscuro' : 'text-tinta-suave'
                }`}
              >
                <span
                  className={
                    esVenta
                      ? 'flex h-9 w-9 items-center justify-center rounded-full bg-bodega text-white'
                      : `flex h-7 w-14 items-center justify-center rounded-full ${activo ? 'bg-bodega-claro' : ''}`
                  }
                >
                  <Icono tamano={esVenta ? 20 : 22} />
                </span>
                <span className={`text-[11px] ${activo || esVenta ? 'font-bold' : ''}`}>{acceso.etiqueta}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
