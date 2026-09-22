'use client';

import { useState } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Vende Fácil — Foto del comprobante de pago (Yape/Plin)
 * ------------------------------------------------------------
 * Ícono (botón) para abrir la foto que el bodeguero adjuntó a una
 * venta, y visor a pantalla completa. La base solo guarda la URI del
 * archivo (ver `infraestructura/comprobante-pago/capturar-foto.ts`);
 * `Capacitor.convertFileSrc` la convierte en una dirección que el
 * WebView sí puede mostrar en un <img>.
 */
export function IconoImagen({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m21 16-5-5-8 8" />
    </svg>
  );
}

export function VisorFotoComprobante({
  ruta,
  titulo,
  onCerrar,
}: {
  ruta: string;
  titulo: string;
  onCerrar: () => void;
}) {
  const [falloCarga, setFalloCarga] = useState(false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      onClick={onCerrar}
    >
      <div className="flex items-center justify-between gap-3 px-5 py-4 text-white">
        <p className="min-w-0 truncate text-sm font-semibold">{titulo}</p>
        <button
          type="button"
          onClick={onCerrar}
          className="h-10 shrink-0 rounded-full bg-white/15 px-4 text-sm font-semibold"
        >
          Cerrar
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {falloCarga ? (
          <p className="max-w-xs text-center text-sm text-white/80">
            No se pudo abrir la foto. Es posible que el archivo ya no exista en el celular (por
            ejemplo, si se borró de la galería o si el respaldo se restauró en otro equipo).
          </p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={Capacitor.convertFileSrc(ruta)}
            alt="Foto del comprobante de pago"
            onError={() => setFalloCarga(true)}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        )}
      </div>
    </div>
  );
}
