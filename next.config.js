/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // La app debe funcionar instalada como PWA y operar sin conexión
  // (ver sección 4 del documento maestro). El manifest y el service
  // worker viven en /public y se registran desde el layout raíz.
  headers: async () => [
    {
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Service-Worker-Allowed', value: '/' },
      ],
    },
  ],
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
