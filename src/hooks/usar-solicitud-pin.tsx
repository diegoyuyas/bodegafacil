'use client';

import { useCallback, useRef, useState } from 'react';
import type { CategoriaPin } from '@/core/bloqueo-pin';
import type { ContenedorRepositorios } from '@/infraestructura/sqlite/contenedor';

interface Solicitud {
  accion: string;
}

/**
 * Pide el PIN en medio de una operación (anular o modificar), según los
 * interruptores de Más > Configuración > Configurar PIN.
 *
 *   const { pedirPin, modalPin } = usarSolicitudPin(contenedor);
 *   ...
 *   if (!(await pedirPin('anular', 'anular esta venta'))) return;
 *   ...
 *   return (<> ... {modalPin} </>);
 *
 * Si no hay PIN, o el interruptor de esa categoría está apagado, `pedirPin`
 * resuelve `true` al instante sin mostrar nada.
 */
export function usarSolicitudPin(contenedor: ContenedorRepositorios | null) {
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null);
  const [pin, setPin] = useState('');
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const pedirPin = useCallback(
    (categoria: CategoriaPin, accion: string): Promise<boolean> => {
      if (!contenedor || !contenedor.bloqueoPin.requiereParaDestino(categoria)) {
        return Promise.resolve(true);
      }
      return new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setPin('');
        setMensajeError(null);
        setSolicitud({ accion });
      });
    },
    [contenedor],
  );

  function cerrar(ok: boolean) {
    resolver.current?.(ok);
    resolver.current = null;
    setSolicitud(null);
    setPin('');
    setMensajeError(null);
  }

  async function confirmar() {
    if (!contenedor) return;
    setVerificando(true);
    setMensajeError(null);
    const correcto = await contenedor.bloqueoPin.verificar(pin);
    setVerificando(false);
    if (!correcto) {
      setMensajeError('PIN incorrecto.');
      setPin('');
      return;
    }
    cerrar(true);
  }

  const modalPin = solicitud ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
      <div className="w-full max-w-xs rounded-2xl bg-papel p-5 text-center shadow-xl">
        <p className="text-base font-extrabold text-bodega-oscuro">Ingresa tu PIN</p>
        <p className="mt-1 text-xs text-tinta/60">Para {solicitud.accion}.</p>

        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
            setMensajeError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && pin.length === 4 && confirmar()}
          autoFocus
          className="mt-4 h-12 w-36 rounded-xl border border-linea text-center text-xl tracking-[0.5em]"
        />

        {mensajeError && <p className="mt-2 text-xs text-alerta">{mensajeError}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => cerrar(false)}
            className="h-11 flex-1 rounded-xl border border-linea text-sm font-semibold text-tinta/70"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={verificando || pin.length !== 4}
            className="h-11 flex-1 rounded-xl bg-bodega text-sm font-semibold text-white disabled:opacity-40"
          >
            {verificando ? 'Verificando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { pedirPin, modalPin };
}
