import type { Metadata, Viewport } from 'next';
import { RegistrarServiceWorker } from '@/components/registrar-service-worker';
import { PantallaSplash } from '@/components/pantalla-splash';
import { ManejarBotonAtras } from '@/components/manejar-boton-atras';
import { BloqueoPinAcceso } from '@/components/bloqueo-pin-acceso';
import { RevisarBackupAutomatico } from '@/components/revisar-backup-automatico';
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
    <html lang="es">
      <body className="font-sans">
        <PantallaSplash>
          <BloqueoPinAcceso>
            {children}
            <RevisarBackupAutomatico />
          </BloqueoPinAcceso>
        </PantallaSplash>
        <RegistrarServiceWorker />
        <ManejarBotonAtras />
      </body>
    </html>
  );
}
