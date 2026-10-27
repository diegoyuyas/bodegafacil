import { ProtegerPantalla } from '@/components/proteger-pantalla';

/** Solo un administrador entra a esta pantalla cuando rige el control de usuarios. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ProtegerPantalla permiso="configuracion">{children}</ProtegerPantalla>;
}
