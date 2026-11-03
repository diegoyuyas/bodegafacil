import type { Metadata, Viewport } from 'next';
import { RegistrarServiceWorker } from '@/components/registrar-service-worker';
import { PantallaSplash } from '@/components/pantalla-splash';
import { ManejarBotonAtras } from '@/components/manejar-boton-atras';
import { BarraInferior } from '@/components/barra-inferior';
import { AccionesFlotantesInicio } from '@/components/acciones-flotantes-inicio';
import { BloqueoPinAcceso } from '@/components/bloqueo-pin-acceso';
import { ProveedorSesion } from '@/components/sesion-usuario';
import { ProveedorAvisos } from '@/components/proveedor-avisos';
import { ProveedorApariencia } from '@/components/proveedor-apariencia';
import { SCRIPT_APARIENCIA_INICIAL } from '@/core/apariencia';
import { RevisarBackupAutomatico } from '@/components/revisar-backup-automatico';
import { SolicitarPermisosIniciales } from '@/components/solicitar-permisos-iniciales';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vende Fácil',
  description:
    'Registra tus ventas, controla tu caja, sabe qué tienes, qué te deben y qué necesitas comprar — sin depender de internet.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Vende Fácil',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0C6B7D',
  // NO agregar `viewportFit: 'cover'`: en Capacitor 8 (SystemBars) esa
  // etiqueta le avisa a Android que la app dibujará por detrás de las
  // barras del sistema (edge-to-edge). Sin ella, Capacitor mismo deja el
  // contenido entre la barra de estado y la de navegación.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: el script del <head> puede poner la clase «dark» en <html> antes de que React arranque.
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Pone el modo oscuro ANTES de la primera pintura, para que no haya un destello blanco. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_APARIENCIA_INICIAL }} />
      </head>
      <body className="font-sans">
        <ProveedorApariencia>
          <PantallaSplash>
            <ProveedorSesion>
              <ProveedorAvisos>
                <BloqueoPinAcceso>
                  {children}
                  <BarraInferior />
                  <AccionesFlotantesInicio />
                  <RevisarBackupAutomatico />
                  <SolicitarPermisosIniciales />
                </BloqueoPinAcceso>
              </ProveedorAvisos>
            </ProveedorSesion>
          </PantallaSplash>
          <RegistrarServiceWorker />
          <ManejarBotonAtras />
        </ProveedorApariencia>
      </body>
    </html>
  );
}
