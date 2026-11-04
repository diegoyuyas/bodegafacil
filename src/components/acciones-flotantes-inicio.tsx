'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CLAVE_MODO_VENTA_VOZ, modoVentaVozDisponible } from '@/core/configuracion';
import { mostrarBotonNuevaVenta } from '@/core/navegacion';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { usarEscribiendo } from '@/hooks/usar-escribiendo';

/**
 * Botón flotante «Nueva venta» de Inicio y de Pedidos y, si la venta por voz está activada, el botón «Nueva Venta
 * por Voz» (micrófono, turquesa con letras blancas) a su izquierda. Los dos conviven.
 *
 * Vive en el layout raíz, junto a la barra inferior, y NO dentro de la pantalla: dentro de la pantalla el
 * contenedor animado (`.transicion-pantalla`) hace que «fixed» se pegue al fondo de la página en vez del de la
 * pantalla, y el botón solo se veía al llegar al final. Aquí sí es fijo de verdad:
 *   - abajo a la derecha, 16 px sobre la barra (4 rem de barra + 1 rem) y sobre el área segura de Android;
 *   - por encima del contenido y de la barra (z-30) pero por debajo de los pop-ups (z-50);
 *   - se oculta mientras se escribe (teclado abierto) y fuera de Inicio y Pedidos (no sale en Productos ni Clientes).
 */
export function AccionesFlotantesInicio() {
  const pathname = usePathname();
  const { contenedor } = usarContenedor();
  const escribiendo = usarEscribiendo();

  if (!mostrarBotonNuevaVenta(pathname) || escribiendo) return null;

  const modoVoz = contenedor
    ? modoVentaVozDisponible(contenedor.configuracion.obtenerValor(CLAVE_MODO_VENTA_VOZ), contenedor.plan.obtenerEstado().tipo === 'premium')
    : false;

  return (
    <>
      {/* Venta por voz: círculo turquesa igual que «Nueva venta» (72 px), justo a su izquierda; ambos conviven */}
      {modoVoz && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+var(--area-segura-abajo)+var(--desfase-viewport-abajo,0px))] z-30 mx-auto flex max-w-app justify-end pl-4 pr-[6.25rem]">
          <Link
            href="/ventas/voz"
            aria-label="Nueva venta por voz"
            className="pointer-events-auto flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full bg-bodega text-white shadow-lg active:bg-bodega-oscuro"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <path d="M12 18v4" />
            </svg>
            <span className="text-center text-[10px] font-extrabold leading-[1.05]">
              Nueva
              <br />
              Venta
              <br />
              por Voz
            </span>
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
