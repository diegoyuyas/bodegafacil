/**
 * Tipos mínimos para `window.google.accounts.oauth2` (Google Identity
 * Services), cargado dinámicamente desde
 * `src/infraestructura/google-drive/autenticacion.ts`. No existe un
 * paquete oficial de tipos para este script, así que se declaran a
 * mano solo los campos que la app realmente usa.
 */

interface RespuestaTokenGoogle {
  access_token: string;
  expires_in: number;
  error?: string;
}

interface ErrorTokenGoogle {
  type: string;
  message?: string;
}

interface ClienteTokenGoogle {
  requestAccessToken: () => void;
}

interface ConfiguracionClienteTokenGoogle {
  client_id: string;
  scope: string;
  callback: (respuesta: RespuestaTokenGoogle) => void;
  error_callback?: (error: ErrorTokenGoogle) => void;
}

interface Window {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient: (config: ConfiguracionClienteTokenGoogle) => ClienteTokenGoogle;
      };
    };
  };
}
