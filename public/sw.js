/**
 * Bodega Fácil — Service worker mínimo (offline-first)
 * ------------------------------------------------------------
 * No usa una lista de precache fija porque los assets de Next.js
 * cambian de nombre en cada build. En su lugar:
 *
 *  - Navegación (HTML): intenta red primero; si falla (sin internet),
 *    responde con la última versión de la página guardada en caché.
 *  - Assets estáticos (/_next/static, íconos, manifest): cache-first,
 *    porque son inmutables una vez publicados.
 *
 * Cuando el proyecto tenga proceso de build definido, esto se puede
 * reemplazar por un precache generado (ej. Workbox) sin cambiar la
 * estrategia de arriba.
 */

const CACHE_ESTATICO = 'bodega-facil-estatico-v1';
const CACHE_PAGINAS = 'bodega-facil-paginas-v1';

self.addEventListener('install', (evento) => {
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((nombre) => ![CACHE_ESTATICO, CACHE_PAGINAS].includes(nombre))
          .map((nombre) => caches.delete(nombre)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  const solicitud = evento.request;
  if (solicitud.method !== 'GET') return;

  const esNavegacion = solicitud.mode === 'navigate';
  const esEstatico = solicitud.url.includes('/_next/static/') ||
    /\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$/.test(solicitud.url);

  if (esNavegacion) {
    evento.respondWith(
      fetch(solicitud)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(CACHE_PAGINAS).then((cache) => cache.put(solicitud, copia));
          return respuesta;
        })
        .catch(() => caches.match(solicitud).then((r) => r || caches.match('/'))),
    );
    return;
  }

  if (esEstatico) {
    evento.respondWith(
      caches.match(solicitud).then(
        (enCache) =>
          enCache ||
          fetch(solicitud).then((respuesta) => {
            const copia = respuesta.clone();
            caches.open(CACHE_ESTATICO).then((cache) => cache.put(solicitud, copia));
            return respuesta;
          }),
      ),
    );
  }
});
