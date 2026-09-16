/** @type {import('next').NextConfig} */

// Capacitor no corre un servidor Next.js dentro del celular: necesita
// HTML/JS/CSS estáticos que pueda copiar tal cual al proyecto Android
// (ver android/app/src/main/assets/public tras `npx cap sync`). Por
// eso el build para el APK usa `output: 'export'` (genera la carpeta
// /out), mientras que `npm run dev` y un build "normal" (por si en
// algún momento se hostea la PWA en una URL) siguen funcionando igual
// que antes. Se activa solo con la variable BUILD_CAPACITOR=1 (ver
// script "build:apk" en package.json) para no romper nada existente.
const paraCapacitor = process.env.BUILD_CAPACITOR === '1';

const nextConfig = {
  reactStrictMode: true,
  ...(paraCapacitor
    ? {
        // Export estático: sin servidor, sin optimizador de imágenes
        // en runtime (no se usa next/image en el proyecto, así que
        // esto no cambia nada visualmente).
        output: 'export',
        images: { unoptimized: true },
      }
    : {
        // La app debe funcionar instalada como PWA y operar sin conexión
        // (ver sección 4 del documento maestro). El manifest y el service
        // worker viven en /public y se registran desde el layout raíz.
        // (Estos headers no aplican con `output: 'export'`, por eso solo
        // se agregan en el build "normal".)
        headers: async () => [
          {
            source: '/sw.js',
            headers: [
              { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
              { key: 'Service-Worker-Allowed', value: '/' },
            ],
          },
        ],
      }),
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // sql.js (dist/sql-wasm.js) es un build "isomórfico": tiene una
      // rama que usa require("node:fs")/require("node:crypto") solo
      // cuando corre en Node, protegida por un chequeo en tiempo de
      // ejecución. Esa rama nunca se ejecuta en el navegador, pero
      // webpack maneja el esquema "node:" ANTES de la resolución
      // normal y falla con "Unhandled scheme" — un alias no alcanza
      // acá. Primero se normaliza "node:fs" -> "fs" (quitando el
      // esquema) y luego se le dice a webpack que no hace falta
      // empaquetar esos módulos en el cliente (fallback: false).
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, '');
        }),
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        crypto: false,
        path: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
