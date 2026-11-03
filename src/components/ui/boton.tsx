import type { ButtonHTMLAttributes } from 'react';

/**
 * Botón estándar de la app. Un solo juego de tamaños y colores para todas las pantallas.
 *  - principal: acción más importante de la pantalla (cobrar, guardar).
 *  - secundario: acción alternativa (borde turquesa).
 *  - peligroso: acciones que borran o anulan (borde rojo, nunca relleno para que no se toque por error).
 *  - suave: acciones menores sobre fondo claro.
 * Por defecto ocupa todo el ancho; con `anchoCompleto={false}` se ajusta al texto.
 */
export type VarianteBoton = 'principal' | 'secundario' | 'peligroso' | 'suave';
export type TamanoBoton = 'chico' | 'normal' | 'grande';

const VARIANTES: Record<VarianteBoton, string> = {
  principal: 'bg-bodega text-white active:bg-bodega-oscuro',
  secundario: 'border border-bodega text-bodega active:bg-bodega-claro',
  peligroso: 'border border-alerta text-alerta active:bg-alerta/10',
  suave: 'bg-bodega-claro text-bodega-oscuro active:bg-bodega-claro/70',
};

const TAMANOS: Record<TamanoBoton, string> = {
  chico: 'h-10 rounded-lg text-sm',
  normal: 'h-12 rounded-xl text-sm',
  grande: 'h-14 rounded-xl text-base',
};

export interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  anchoCompleto?: boolean;
}

export function Boton({
  variante = 'principal',
  tamano = 'normal',
  anchoCompleto = true,
  type = 'button',
  className = '',
  ...resto
}: PropsBoton) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center font-semibold disabled:opacity-40 ${TAMANOS[tamano]} ${VARIANTES[variante]} ${
        anchoCompleto ? 'w-full' : 'px-4'
      } ${className}`}
      {...resto}
    />
  );
}
