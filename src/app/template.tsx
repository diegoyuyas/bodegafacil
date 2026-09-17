/**
 * Vende Fácil — Transición entre pantallas
 * ------------------------------------------------------------
 * A diferencia de `layout.tsx` (persiste entre navegaciones),
 * `template.tsx` es una convención de Next.js que crea una instancia
 * nueva de sus hijos en cada navegación — pensada justo para animar
 * la entrada de cada pantalla sin librerías externas. Al vivir en la
 * raíz de `app/`, envuelve TODAS las rutas de la app por igual.
 *
 * La animación (fade through + scale, ver `.transicion-pantalla` en
 * globals.css) se dispara sola en cada cambio de ruta porque el `div`
 * de abajo se vuelve a montar — no hace falta lógica de React.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="transicion-pantalla">{children}</div>;
}
