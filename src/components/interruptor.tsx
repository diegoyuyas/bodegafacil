'use client';

/**
 * Interruptor ON/OFF con la misma identidad visual que el resto de
 * la app (verde toldo cuando está activo). Se arma con Tailwind puro.
 * Lo usan las pantallas de Más > Configuración (por ejemplo,
 * Configuración de Venta).
 */
export function Interruptor({
  activado,
  onChange,
  disabled,
}: {
  activado: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activado}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        activado ? 'bg-bodega' : 'bg-linea'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-150 ${
          activado ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
