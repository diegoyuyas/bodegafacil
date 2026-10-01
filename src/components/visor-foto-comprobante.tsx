'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  onElegirDeGaleria,
}: {
  ruta: string;
  titulo: string;
  onCerrar: () => void;
  /**
   * Si se pasa, el visor ofrece elegir manualmente otra foto de la galería
   * (por ejemplo cuando el archivo original ya no existe, como después de
   * reinstalar la app y restaurar un respaldo). El padre guarda la nueva
   * ruta y vuelve a pasar `ruta`; si falla, debe lanzar un Error con el
   * mensaje a mostrar.
   */
  onElegirDeGaleria?: () => Promise<void>;
}) {
  const [falloCarga, setFalloCarga] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  // El visor se monta con un portal directo a <body> (ver el return más
  // abajo): position:fixed anidado dentro del contenido largo de una
  // pantalla (como Reportes) puede quedar "atado" a ese contenedor en vez
  // de a toda la pantalla en el WebView de Android, y entonces el visor
  // se desplaza hacia abajo junto con el resto del contenido en vez de
  // quedar fijo — createPortal lo saca de ahí por completo. document
  // no existe en el render del servidor, así que recién se monta tras
  // el primer render en el navegador.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  // Al cambiar la foto (recién elegida) se vuelve a intentar mostrarla.
  useEffect(() => {
    setFalloCarga(false);
  }, [ruta]);

  async function elegirDeGaleria() {
    if (!onElegirDeGaleria) return;
    setMensaje(null);
    setEligiendo(true);
    try {
      await onElegirDeGaleria();
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'No se pudo cambiar la foto.');
    } finally {
      setEligiendo(false);
    }
  }

  if (!montado) return null;

  return createPortal(
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
            ejemplo, si se borró de la galería o si la app se reinstaló y se restauró un respaldo).
            {onElegirDeGaleria && ' Puedes elegirla de nuevo desde tu galería.'}
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

      {onElegirDeGaleria && (
        <div
          className="flex flex-col items-center gap-2 px-5 pb-[calc(1.25rem+var(--area-segura-abajo))] pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          {mensaje && <p className="text-center text-xs text-red-300">{mensaje}</p>}
          <button
            type="button"
            onClick={elegirDeGaleria}
            disabled={eligiendo}
            className={`h-12 w-full max-w-xs rounded-full text-sm font-semibold disabled:opacity-60 ${
              falloCarga ? 'bg-bodega text-white' : 'bg-white/15 text-white'
            }`}
          >
            {eligiendo
              ? 'Abriendo galería…'
              : falloCarga
                ? 'Elegir foto de la galería'
                : 'Cambiar foto (elegir de la galería)'}
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
