'use client';

import { useState } from 'react';

/**
 * Muestra UNA SOLA VEZ la clave de recuperación para que se anote. Hasta que no se marque
 * "Ya la anoté" no se puede continuar. Con esta clave se puede poner una contraseña nueva
 * si se olvida la de un administrador (la app no tiene servidor donde recuperarla).
 */
export function MostrarClaveRecuperacion({
  clave,
  onListo,
  textoBoton = 'Continuar',
}: {
  clave: string;
  onListo: () => void;
  textoBoton?: string;
}) {
  const [anotada, setAnotada] = useState(false);
  const [copiada, setCopiada] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(clave);
      setCopiada(true);
    } catch {
      setCopiada(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-acento bg-acento/10 p-3">
        <p className="text-sm font-bold text-tinta">Anota esta clave de recuperación</p>
        <p className="mt-1 text-xs text-tinta/70">
          Es tu única salida si olvidas la contraseña de un administrador. <strong>Se muestra una sola vez.</strong>{' '}
          Guárdala en papel, en un lugar seguro, y no la compartas.
        </p>
      </div>
      <p
        aria-label="Clave de recuperación"
        className="select-all rounded-xl border-2 border-dashed border-bodega bg-white py-5 text-center font-mono text-2xl font-extrabold tracking-widest text-bodega-oscuro"
      >
        {clave}
      </p>
      <button type="button" onClick={copiar} className="h-11 w-full rounded-xl border border-linea text-sm font-semibold text-tinta">
        {copiada ? 'Copiada ✓' : 'Copiar clave'}
      </button>
      <label className="flex items-start gap-3 text-sm text-tinta">
        <input type="checkbox" checked={anotada} onChange={(e) => setAnotada(e.target.checked)} className="mt-1 h-5 w-5" />
        <span>Ya la anoté en un lugar seguro.</span>
      </label>
      <button
        type="button"
        onClick={onListo}
        disabled={!anotada}
        className="h-12 w-full rounded-full bg-bodega text-base font-semibold text-white active:bg-bodega-oscuro disabled:opacity-40"
      >
        {textoBoton}
      </button>
    </div>
  );
}
