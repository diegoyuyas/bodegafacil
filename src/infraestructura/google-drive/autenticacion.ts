/**
 * Vende Fácil — Autenticación con Google (solo para exportar a Drive)
 * ------------------------------------------------------------
 * No hay backend, así que usamos el flujo 100% client-side de Google
 * Identity Services (GIS): el usuario toca "Conectar con Google", se
 * abre la pantalla oficial de Google donde inicia sesión o elige su
 * cuenta, y recibimos un token de acceso temporal (no una contraseña,
 * no un refresh token persistente). Ese token solo sirve para escribir
 * en el Drive de esa cuenta, con el scope más acotado posible
 * (`drive.file`): la app únicamente puede ver/editar los archivos que
 * ella misma crea, nunca el resto del Drive del usuario.
 *
 * Requiere que en `.env.local` (o en el entorno de build) exista
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID, generado en Google Cloud Console
 * (ver README para el paso a paso). Sin esa variable, esta función
 * lanza un error claro en vez de fallar en silencio.
 */

const URL_SCRIPT_GIS = 'https://accounts.google.com/gsi/client';
const SCOPE_DRIVE_ARCHIVO_PROPIO = 'https://www.googleapis.com/auth/drive.file';

export interface TokenGoogle {
  accessToken: string;
  /** Segundos de vida del token (típicamente 3600). */
  expiraEnSegundos: number;
}

let promesaScriptCargado: Promise<void> | null = null;

function cargarScriptGis(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Solo se puede autenticar con Google desde el navegador.'));
  }
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (!promesaScriptCargado) {
    promesaScriptCargado = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = URL_SCRIPT_GIS;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error('No se pudo cargar Google (revisa tu conexión a internet).'));
      document.head.appendChild(script);
    });
  }
  return promesaScriptCargado;
}

/**
 * Abre la pantalla de Google para que el usuario elija/inicie sesión
 * con su cuenta y autorice el acceso. Se resuelve con un token de
 * acceso temporal para usar contra la API de Drive.
 */
export async function conectarConGoogle(): Promise<TokenGoogle> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      'Falta configurar NEXT_PUBLIC_GOOGLE_CLIENT_ID. Revisa el README para crear las credenciales en Google Cloud Console.',
    );
  }

  await cargarScriptGis();

  return new Promise((resolve, reject) => {
    const cliente = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE_DRIVE_ARCHIVO_PROPIO,
      callback: (respuesta) => {
        if (respuesta.error) {
          reject(new Error(`Google no autorizó el acceso: ${respuesta.error}`));
          return;
        }
        resolve({
          accessToken: respuesta.access_token,
          expiraEnSegundos: Number(respuesta.expires_in ?? 3600),
        });
      },
      error_callback: (err) => {
        reject(new Error(err?.message || 'El usuario canceló el inicio de sesión con Google.'));
      },
    });
    cliente.requestAccessToken();
  });
}
