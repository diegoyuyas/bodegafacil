import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuración de Capacitor — el envoltorio nativo que convierte el
 * export estático de Next.js (carpeta /out, generada con
 * `npm run build:apk`) en un proyecto Android real, compilable a un
 * .apk instalable sin Play Store.
 *
 * `appId` (el identificador único de la app, ej. en Google Play o al
 * reinstalar) NO se debe cambiar una vez que algún bodeguero ya
 * instaló un .apk: Android trata un cambio de appId como una app
 * completamente distinta, así que tendría que desinstalar la vieja
 * a mano. Elegir uno bueno ahora y no tocarlo después.
 */
const config: CapacitorConfig = {
  appId: 'pe.vendefacil.app',
  appName: 'Vende Fácil',
  webDir: 'out',
  android: {
    // Mismo color que el fondo de la app (ver tailwind.config.ts →
    // colors.papel) — evita un parpadeo blanco/negro entre que se
    // abre la app y que termina de pintar el primer frame.
    backgroundColor: '#F4FAF9',
  },
};

export default config;
