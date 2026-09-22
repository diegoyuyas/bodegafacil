/**
 * Vende Fácil — Versión de la app
 * ------------------------------------------------------------
 * Fuente única de la versión que se muestra al usuario (splash de
 * arranque y Más > Acerca de Vende Fácil).
 *
 * Para publicar una nueva versión, ANTES de compilar el APK, cambia
 * este número (y solo este: los otros dos de abajo ya no lo leen).
 * No hace falta tocar nada más de este archivo.
 */
export const VERSION_APP = '1.0.0';

/**
 * `package.json` → "version" y `android/app/build.gradle` →
 * `versionName`/`versionCode` son de Node/Android y no se muestran en
 * ninguna pantalla de la app; quedan como están y son independientes
 * de este número. Si en algún momento quieres que los 3 números vayan
 * siempre iguales, sigue quedando en cambiarlos a mano en cada lugar:
 * no hay nada en el proyecto que los sincronice automáticamente.
 */
