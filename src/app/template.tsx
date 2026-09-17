'use client';

import { usePathname } from 'next/navigation';

/**
 * Vende Fácil — Transición entre pantallas
 * ------------------------------------------------------------
 * A diferencia de `layout.tsx` (persiste entre navegaciones),
 * `template.tsx` es una convención de Next.js que en teoría crea una
 * instancia nueva de sus hijos en cada navegación. En la práctica, el
 * remount "automático" de `template.tsx` no es confiable en todas las
 * rutas: por ejemplo, cuando React puede reconciliar el árbol sin
 * volver a montar el nodo raíz (algo más probable en rutas anidadas
 * como las de `/mas/*`), la animación simplemente no se vuelve a
 * disparar — que es justo el síntoma reportado (Inicio, Productos y
 * Fiados sí animaban; Compras y el resto de `/mas/*` no).
 *
 * La solución robusta: usar `usePathname()` como `key` del propio div.
 * Un cambio de `key` fuerza a React a desmontar y montar un nodo del
 * DOM nuevo SIEMPRE, sin importar qué haga Next.js por su cuenta con
 * el árbol — así la animación (fade through + scale, ver
 * `.transicion-pantalla` en globals.css) se dispara en cada cambio de
 * ruta, en todas las pantallas por igual.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="transicion-pantalla">
      {children}
    </div>
  );
}
