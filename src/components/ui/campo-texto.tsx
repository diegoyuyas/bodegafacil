'use client';

import { useId, type InputHTMLAttributes } from 'react';

/**
 * Campo de texto estándar: etiqueta arriba, ayuda opcional y mensaje de error pegado al campo.
 * Recibe cualquier atributo normal de `<input>` (value, onChange, inputMode, placeholder…).
 */
export interface PropsCampoTexto extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  ayuda?: string;
  error?: string | null;
}

export function CampoTexto({ label, ayuda, error, id, className = '', ...resto }: PropsCampoTexto) {
  const idAuto = useId();
  const idCampo = id ?? idAuto;
  const idNota = `${idCampo}-nota`;
  const nota = error || ayuda;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={idCampo} className="mb-1 block text-xs font-semibold text-tinta/70">
          {label}
        </label>
      )}
      <input
        id={idCampo}
        aria-invalid={error ? true : undefined}
        aria-describedby={nota ? idNota : undefined}
        className={`h-11 w-full rounded-xl border bg-white px-4 text-sm outline-none focus:border-bodega disabled:opacity-50 ${
          error ? 'border-alerta' : 'border-linea'
        }`}
        {...resto}
      />
      {nota && (
        <p id={idNota} className={`mt-1 text-xs ${error ? 'text-alerta' : 'text-tinta-suave'}`}>
          {nota}
        </p>
      )}
    </div>
  );
}
