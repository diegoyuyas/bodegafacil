'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CLAVE_MODO_VENTA_VOZ, modoVentaVozDisponible } from '@/core/configuracion';
import { normalizarRuta } from '@/core/navegacion';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { usarEscribiendo } from '@/hooks/usar-escribiendo';

/**
 * Botón flotante «Nueva venta» de Inicio (y, si está activada, «Nueva Venta por Voz»).
 *
 * Vive en el layout raíz, junto a la barra inferior, y NO dentro de la pantalla: dentro de la pantalla el
 * contenedor animado (`.transicion-pantalla`) hace que «fixed» se pegue al fondo de la página en vez del de la
 * pantalla, y el botón solo se veía al llegar al final. Aquí sí es fijo de verdad:
 *   - abajo a la derecha, 16 px sobre la barra (4 rem de barra + 1 rem) y sobre el área segura de Android;
 *   - por encima del contenido y de la barra (z-30) pero por debajo de los pop-ups (z-50);
 *   - se oculta mientras se escribe (teclado abierto) y fuera de Inicio.
 */
export function AccionesFlotantesInicio() {
  const pathname = usePathname();
  const { contenedor } = usarContenedor();
  const escribiendo = usarEscribiendo();

  if (pathname === null || normalizarRuta(pathname) !== '/' || escribiendo) return null;

  const modoVoz = contenedor
    ? modoVentaVozDisponible(contenedor.configuracion.obtenerValor(CLAVE_MODO_VENTA_VOZ), contenedor.plan.obtenerEstado().tipo === 'premium')
    : false;

  return (
    <>
      {/* Venta por voz: a la izquierda, dejando libre el lugar del botón flotante de la derecha */}
      {modoVoz && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+var(--area-segura-abajo)+var(--desfase-viewport-abajo,0px))] z-30 mx-auto flex max-w-app gap-3 pl-5 pr-[7rem]">
          <Link
            href="/ventas/voz"
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full border-2 border-bodega bg-white px-2 text-center text-sm font-semibold leading-tight text-bodega-oscuro shadow-sm active:bg-bodega-claro"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <path d="M12 18v4" />
            </svg>
            <span>Nueva Venta por Voz</span>
          </Link>
        </div>
      )}

      {/* Botón flotante «Nueva venta»: abajo a la derecha, 16 px sobre la barra, siempre visible, con halo que pulsa */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+var(--area-segura-abajo)+var(--desfase-viewport-abajo,0px))] z-30 mx-auto flex max-w-app justify-end px-4">
        <div className="pointer-events-auto relative h-[72px] w-[72px]">
          <span aria-hidden="true" className="fab-halo absolute inset-0 rounded-full bg-[#4ADE80]" />
          <Link
            href="/ventas/nueva"
            aria-label="Nueva venta"
            className="relative flex h-full w-full flex-col items-center justify-center rounded-full bg-[#4ADE80] text-[#14532D] shadow-lg"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="-mt-0.5 text-center text-[11px] font-extrabold leading-[1.05]">
              Nueva
              <br />
              Venta
            </span>
          </Link>
        </div>
      </div>
    </>
  );
}
