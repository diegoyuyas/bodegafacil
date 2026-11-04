/**
 * Vende Fácil — Barra de navegación inferior (lógica pura)
 * ------------------------------------------------------------
 * Qué accesos tiene la barra, en qué pantallas se muestra, cuál está activo y cuándo se oculta
 * porque el usuario está escribiendo. Sin React ni rutas reales: se prueba con `tsx`.
 */

export type IdAcceso = 'inicio' | 'pedidos' | 'productos' | 'clientes' | 'mas';

export interface AccesoBarra {
  id: IdAcceso;
  href: string;
  etiqueta: string;
}

/**
 * Los 5 accesos fijos. «Pedidos» abre la lista de pedidos (antes «Venta»; la venta nueva se abre con el botón
 * flotante «Nueva venta»). «Clientes» abre el directorio de clientes (`/mas/clientes`); la pantalla de
 * fiados (quién debe, cobrar, recordar) se abre desde Más > Fiados.
 */
export const ACCESOS_BARRA: AccesoBarra[] = [
  { id: 'inicio', href: '/', etiqueta: 'Inicio' },
  { id: 'pedidos', href: '/pedidos', etiqueta: 'Pedidos' },
  { id: 'productos', href: '/productos', etiqueta: 'Productos' },
  { id: 'clientes', href: '/mas/clientes', etiqueta: 'Clientes' },
  { id: 'mas', href: '/mas', etiqueta: 'Más' },
];

/**
 * Pantallas principales, donde la barra se muestra. En cualquier otra (formularios, venta en curso,
 * compras, subpantallas de Más…) queda oculta: ahí manda la acción de la propia pantalla.
 */
const RUTAS_CON_BARRA = ['/', '/pedidos', '/productos', '/mas/clientes', '/mas'];

/** El botón flotante «Nueva venta» solo se ve en Inicio y en Pedidos (no en Productos, Clientes ni Más). */
const RUTAS_CON_BOTON_NUEVA_VENTA = ['/', '/pedidos'];

/** '/productos/' y '/productos.html' (según cómo sirva la app) se tratan como '/productos'. */
export function normalizarRuta(ruta: string): string {
  let r = ruta.split('?')[0]?.split('#')[0] ?? '';
  r = r.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  if (r.length > 1) r = r.replace(/\/+$/, '');
  return r === '' ? '/' : r;
}

export function mostrarBarraInferior(pathname: string | null): boolean {
  if (pathname === null) return false;
  return RUTAS_CON_BARRA.includes(normalizarRuta(pathname));
}

export function mostrarBotonNuevaVenta(pathname: string | null): boolean {
  if (pathname === null) return false;
  return RUTAS_CON_BOTON_NUEVA_VENTA.includes(normalizarRuta(pathname));
}

/**
 * Acceso resaltado: el más específico que contiene la ruta. Inicio solo en '/'; «Clientes»
 * (`/mas/clientes`) gana sobre «Más» (`/mas`) aunque su ruta cuelgue de ella.
 */
export function esAccesoActivo(href: string, pathname: string | null): boolean {
  if (pathname === null) return false;
  const ruta = normalizarRuta(pathname);
  const contiene = (h: string) => (h === '/' ? ruta === '/' : ruta === h || ruta.startsWith(`${h}/`));
  if (!contiene(href)) return false;
  return !ACCESOS_BARRA.some((otro) => otro.href.length > href.length && contiene(otro.href));
}

/**
 * Cuántos píxeles hay que SUBIR un elemento fijo abajo para que quede pegado al borde de lo que se ve en
 * pantalla. Si el área que la página usa para colocar lo «fixed» (`alturaLayout`) es más alta que lo que
 * realmente se ve (`alturaVisible` + `desplazamientoVisible`), lo fijo queda con su parte de abajo fuera de
 * pantalla. 0 = no hay nada que corregir. Una diferencia enorme (más de la cuarta parte de la pantalla) es el
 * teclado, no un desfase: se ignora.
 */
export function calcularDesfaseAbajo(alturaLayout: number, alturaVisible: number, desplazamientoVisible: number): number {
  if (![alturaLayout, alturaVisible, desplazamientoVisible].every((n) => Number.isFinite(n)) || alturaLayout <= 0) return 0;
  const diferencia = alturaLayout - (alturaVisible + desplazamientoVisible);
  if (diferencia < 2) return 0; // redondeos y subpíxeles
  if (diferencia > alturaLayout * 0.25) return 0; // teclado u otra cosa: no es un desfase
  return Math.round(diferencia);
}

/**
 * Tipos de campo que abren el teclado. Los de fecha y hora (date, time, month, week, datetime-local) NO están: en
 * Android abren un calendario/reloj, no el teclado, y como el campo conserva el foco después de elegir la fecha, la
 * barra inferior y el botón flotante se quedaban escondidos (p. ej. al filtrar Pedidos por fechas).
 */
const TIPOS_DE_TEXTO = new Set(['', 'text', 'search', 'tel', 'url', 'email', 'password', 'number']);

/**
 * ¿El elemento enfocado abre el teclado? Mientras sea así la barra se oculta (en Android el teclado
 * la empujaría hacia arriba y taparía el formulario).
 */
export function esCampoDeTexto(etiqueta: string | null | undefined, tipo: string | null | undefined, editable = false): boolean {
  if (editable) return true;
  const e = (etiqueta ?? '').toUpperCase();
  if (e === 'TEXTAREA') return true;
  if (e === 'INPUT') return TIPOS_DE_TEXTO.has((tipo ?? '').toLowerCase());
  return false;
}
