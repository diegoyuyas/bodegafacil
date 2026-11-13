'use client';

import { useState } from 'react';
import { limpiarDecimalEscrito, limpiarEnteroEscrito, numeroDeCasilla } from '@/core/texto';

/**
 * Casilla de un número para Compras. Muestra EXACTAMENTE lo que se escribe (puede quedar vacía mientras se escribe otro
 * número) y avisa el valor ya como número: vacío vale 0. Al salir de la casilla se ve el número limpio ("1", "2.5").
 * Con una casilla de tipo número el navegador devolvía el 0 al borrar y quedaba «01»; por eso es texto con teclado numérico.
 */
export function CasillaNumero({
  valor,
  onCambiar,
  decimales,
  className,
  ariaLabel,
}: {
  valor: number;
  onCambiar: (numero: number) => void;
  /** Con decimales (costo, cantidad de un producto normal) o solo enteros (cajas, kg, gramos). */
  decimales: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [borrador, setBorrador] = useState<string | null>(null);
  return (
    <input
      type="text"
      inputMode={decimales ? 'decimal' : 'numeric'}
      enterKeyHint="done"
      value={borrador ?? String(valor)}
      aria-label={ariaLabel}
      onFocus={(e) => e.target.select()}
      onBlur={() => setBorrador(null)}
      onChange={(e) => {
        const limpio = decimales ? limpiarDecimalEscrito(e.target.value) : limpiarEnteroEscrito(e.target.value);
        setBorrador(limpio);
        onCambiar(numeroDeCasilla(limpio));
      }}
      className={className}
    />
  );
}
