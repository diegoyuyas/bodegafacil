'use client';

import { useState } from 'react';
import { IconoWhatsApp } from '@/components/ui/iconos';
import { TEXTO_CONFIRMAR_ANULACION, accionesDeVenta, construirDetalleVenta } from '@/core/detalle-venta';
import { formatearMonto } from '@/core/moneda';
import { formatearFechaHora } from '@/core/tiempo';
import type { LineaVentaResumen, VentaListaItem } from '@/core/tipos';

/**
 * Pop-up (bottom sheet) con el detalle de una venta del Historial de ventas: sus productos con cantidad, precio
 * unitario y subtotal, el total, la forma de pago, el cliente y la fecha; y abajo tres botones grandes:
 * «Enviar por WhatsApp», «Reimprimir» y «Anular venta» (que pide confirmación).
 * Una venta ya anulada se muestra solo para consulta, con su etiqueta «Anulada».
 */
export function DetalleVentaSheet({
  venta,
  lineas,
  etiquetaPago,
  simboloMoneda,
  esPremium,
  avisoAnulacion,
  onEnviarWhatsApp,
  onReimprimir,
  onAnular,
  onCerrar,
  reimprimiendo = false,
}: {
  venta: VentaListaItem;
  lineas: LineaVentaResumen[];
  /** «Efectivo», «Yape», «Fiado»… */
  etiquetaPago: string;
  simboloMoneda: string;
  esPremium: boolean;
  /** Texto extra del cuadro de confirmación (p. ej. un fiado con abonos ya cobrados). */
  avisoAnulacion: string | null;
  onEnviarWhatsApp: () => void;
  onReimprimir: () => void;
  /** Se llama cuando el usuario YA confirmó la anulación. */
  onAnular: () => void;
  onCerrar: () => void;
  reimprimiendo?: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const filas = construirDetalleVenta(lineas);
  const acciones = accionesDeVenta(venta, esPremium);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onCerrar}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle del pedido ${venta.comprobante}`}
        className="flex max-h-[90dvh] w-full max-w-app flex-col rounded-t-2xl bg-papel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <h2 className="text-base font-extrabold text-bodega-oscuro">Detalle del pedido</h2>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-tinta-suave">
              <span>{venta.comprobante}</span>
              {venta.anulada && (
                <span className="rounded-full bg-linea px-2 py-0.5 text-xs font-semibold text-tinta-suave">Anulada</span>
              )}
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="px-1 text-xl leading-none text-tinta-suave" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto px-5">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-suave">Fecha y hora</dt>
              <dd className="text-right text-tinta">{formatearFechaHora(venta.fechaHora)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-suave">Forma de pago</dt>
              <dd className="text-right text-tinta">{etiquetaPago}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-suave">Cliente</dt>
              <dd className="text-right text-tinta">{venta.clienteNombre ?? 'Cliente eventual'}</dd>
            </div>
            {venta.usuarioNombre && (
              <div className="flex justify-between gap-4">
                <dt className="text-tinta-suave">Atendió</dt>
                <dd className="text-right text-tinta">{venta.usuarioNombre}</dd>
              </div>
            )}
          </dl>

          <ul className="mt-4 divide-y divide-linea border-y border-linea">
            {filas.length === 0 && <li className="py-3 text-sm text-tinta-suave">Esta venta no tiene productos registrados.</li>}
            {filas.map((fila, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-tinta">{fila.producto}</p>
                  <p className="text-xs text-tinta-suave">
                    {fila.cantidadTexto}
                    {fila.precioUnitario !== null && ` × ${formatearMonto(fila.precioUnitario, simboloMoneda)}`}
                  </p>
                  {fila.descripcion && <p className="break-words text-xs text-tinta-suave">{fila.descripcion}</p>}
                </div>
                {fila.subtotal !== null && (
                  <p className={`shrink-0 text-sm font-semibold ${venta.anulada ? 'text-tinta-suave line-through' : 'text-tinta'}`}>
                    {formatearMonto(fila.subtotal, simboloMoneda)}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-center justify-between pb-4">
            <span className="text-sm font-semibold text-tinta-suave">Total</span>
            <span className={`text-lg font-extrabold ${venta.anulada ? 'text-tinta-suave line-through' : 'text-tinta'}`}>
              {formatearMonto(venta.total, simboloMoneda)}
            </span>
          </div>
        </div>

        {(acciones.whatsapp || acciones.reimprimir !== 'oculto' || acciones.anular) && (
          <div className="space-y-3 border-t border-linea px-5 pb-[calc(1rem+var(--area-segura-abajo))] pt-4">
            {acciones.whatsapp && (
              <button
                type="button"
                onClick={onEnviarWhatsApp}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#25D366] bg-white text-base font-semibold text-tinta"
              >
                <IconoWhatsApp tamano={26} className="text-[#25D366]" />
                Enviar por WhatsApp
              </button>
            )}
            {acciones.reimprimir !== 'oculto' && (
              <div>
                <button
                  type="button"
                  onClick={onReimprimir}
                  disabled={acciones.reimprimir === 'premium' || reimprimiendo}
                  className="flex h-14 w-full items-center justify-center rounded-xl border-2 border-bodega text-base font-semibold text-bodega disabled:opacity-40"
                >
                  Reimprimir
                </button>
                {acciones.reimprimir === 'premium' && (
                  <p className="mt-1 text-center text-xs font-semibold text-acento-oscuro">Función Premium</p>
                )}
              </div>
            )}
            {acciones.anular && (
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                className="flex h-14 w-full items-center justify-center rounded-xl bg-alerta text-base font-semibold text-white"
              >
                Anular venta
              </button>
            )}
          </div>
        )}

        {confirmando && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-6"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmando(false);
            }}
            role="presentation"
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-label={TEXTO_CONFIRMAR_ANULACION}
              className="w-full max-w-sm rounded-2xl bg-papel p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-base font-bold text-tinta">{TEXTO_CONFIRMAR_ANULACION}</p>
              {avisoAnulacion && <p className="mt-2 text-sm text-tinta-suave">{avisoAnulacion}</p>}
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  className="h-12 flex-1 rounded-xl border-2 border-linea text-sm font-semibold text-tinta"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmando(false);
                    onAnular();
                  }}
                  className="h-12 flex-1 rounded-xl bg-alerta text-sm font-semibold text-white"
                >
                  Anular
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
