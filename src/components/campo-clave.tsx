'use client';

import { useState } from 'react';
import { MAXIMO_CARACTERES_CLAVE } from '@/core/usuarios';

/**
 * Campo de contraseña con botón para mostrarla u ocultarla. No deja escribir espacios
 * (las contraseñas no los llevan) y apaga el corrector del teclado.
 */
export function CampoClave({
  valor,
  onChange,
  placeholder,
  etiquetaAccesible,
  autoFocus,
  onEnter,
}: {
  valor: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  etiquetaAccesible: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={valor}
        onChange={(e) => onChange(e.target.value.replace(/\s/g, '').slice(0, MAXIMO_CARACTERES_CLAVE))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        placeholder={placeholder}
        aria-label={etiquetaAccesible}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="h-12 w-full rounded-xl border border-linea bg-white pl-4 pr-20 text-base outline-none focus:border-bodega"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute right-2 top-1/2 h-9 -translate-y-1/2 rounded-lg px-3 text-xs font-semibold text-bodega-oscuro"
      >
        {visible ? 'Ocultar' : 'Mostrar'}
      </button>
    </div>
  );
}
