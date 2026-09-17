import type { Metadata, Viewport } from 'next';
import { RegistrarServiceWorker } from '@/components/registrar-service-worker';
import { PantallaSplash } from '@/components/pantalla-splash';
import { ManejarBotonAtras } from '@/components/manejar-boton-atras';
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans">
        <PantallaSplash>{children}</PantallaSplash>
        <RegistrarServiceWorker />
        <ManejarBotonAtras />
      </body>
    </html>
  );
}
