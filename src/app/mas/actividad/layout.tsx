import { ProtegerPantalla } from '@/components/proteger-pantalla';

/** Solo un administrador ve la actividad de los usuarios. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ProtegerPantalla permiso="administrar_usuarios">{children}</ProtegerPantalla>;
}
