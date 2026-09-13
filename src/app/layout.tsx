import type { Metadata, Viewport } from 'next';
import { RegistrarServiceWorker } from '@/components/registrar-service-worker';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bodega Fácil',
  description:
    'Registra tus ventas, controla tu caja, sabe qué tienes, qué te deben y qué necesitas comprar — sin depender de internet.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Bodega Fácil',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#2F6F4E',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans">
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
