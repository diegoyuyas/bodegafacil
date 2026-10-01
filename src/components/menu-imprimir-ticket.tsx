'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Vende Fácil — Menú flotante "Imprimir en ticketera / Guardar como..."
 * ------------------------------------------------------------
 * Se abre desde el botón 🖨️ de un pedido ya confirmado (hoy: Inicio >
 * Pedidos Generados) para elegir cómo reconstruir su ticket:
 * - Imprimir en ticketera: manda el texto a la impresora Bluetooth ya
 *   configurada (mismo camino que usaba el botón 🖨️ antes de este
 *   menú). Sale deshabilitada si la impresora no está lista.
 * - Guardar como...: genera el ticket como imagen y abre la hoja
 *   nativa "Compartir" de Android — el bodeguero elige ahí mismo si la
 *   manda a WhatsApp, la guarda en Archivos/galería, etc. Mismo camino
 *   que ya usa el checkbox "Guardar ticket como imagen" al confirmar
 *   una venta.
 */
export function MenuImprimirTicket({
  onImprimirEnTicketera,
  imprimirEnTicketeraDisponible,
  onGuardarComo,
  onCerrar,
  ocupado,
}: {
  onImprimirEnTicketera: () => void;
  imprimirEnTicketeraDisponible: boolean;
  onGuardarComo: () => void;
  onCerrar: () => void;
  ocupado: boolean;
}) {
  // Portal a <body>: este menú se abre desde dentro de la lista larga de
  // Pedidos Generados, y position:fixed anidado ahí puede quedar "atado"
  // a ese contenedor scrolleable en vez de a toda la pantalla (mismo
  // problema que tenía el visor de fotos) — createPortal lo evita del
  // todo. document no existe en el render del servidor, así que recién
  // se monta tras el primer render en el navegador.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-app rounded-t-2xl bg-white p-4 pb-[calc(1rem+var(--area-segura-abajo))]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-center text-sm font-semibold text-tinta">Reconstruir ticket</p>

        <button
          onClick={onImprimirEnTicketera}
          disabled={!imprimirEnTicketeraDisponible || ocupado}
          className="flex h-14 w-full items-center gap-3 rounded-xl border border-linea px-4 text-left text-sm font-semibold text-tinta disabled:opacity-40"
        >
          <span aria-hidden="true" className="text-xl">
            🖨️
          </span>
          <span>
            Imprimir en ticketera
            {!imprimirEnTicketeraDisponible && (
              <span className="mt-0.5 block text-xs font-normal text-tinta/50">
                Activa la impresora en Configuración de Impresión
              </span>
            )}
          </span>
        </button>

        <button
          onClick={onGuardarComo}
          disabled={ocupado}
          className="mt-2 flex h-14 w-full items-center gap-3 rounded-xl border border-linea px-4 text-left text-sm font-semibold text-tinta disabled:opacity-40"
        >
          <span aria-hidden="true" className="text-xl">
            💾
          </span>
          <span>Guardar como...</span>
        </button>

        <button
          onClick={onCerrar}
          className="mt-3 h-12 w-full rounded-xl text-sm font-semibold text-tinta/50"
        >
          Cancelar
        </button>
      </div>
    </div>,
    document.body,
  );
}
