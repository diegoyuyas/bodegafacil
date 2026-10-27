'use client';

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { UsuarioRepositorio } from '@/core/repositorios';
import type { Usuario } from '@/core/usuarios';
import { PuertaClave } from './puerta-clave';
import { RecuadroUsuario } from './recuadro-usuario';

/**
 * Pantalla de acceso del control de usuarios. Cubre toda la app hasta que alguien entra:
 *
 *   ¿Quién va a usar la app?
 *   [ D ]   [ L ]
 *   Diego    Luis
 *
 * Se toca un recuadro, se escribe la contraseña y se entra. Cada intento (bueno o malo) se
 * guarda con `persistir`, así el bloqueo por intentos fallidos no se pierde al cerrar la app.
 * El botón "Atrás" de Android no navega por detrás: vuelve a los recuadros y, ahí, minimiza la app.
 */
export function PantallaAcceso({
  usuarios,
  persistir,
  onAcceso,
}: {
  usuarios: UsuarioRepositorio;
  persistir: () => Promise<void>;
  onAcceso: (usuario: Usuario) => void;
}) {
  const [lista] = useState(() => usuarios.listarActivos());
  const [elegido, setElegido] = useState<Usuario | null>(null);

  useEffect(() => {
    const alAtras = (e: Event) => {
      e.preventDefault();
      if (elegido) {
        setElegido(null);
        return;
      }
      if (Capacitor.isNativePlatform()) {
        void import('@capacitor/app').then(({ App }) => App.minimizeApp());
      }
    };
    window.addEventListener('vendefacil:atras', alAtras);
    return () => window.removeEventListener('vendefacil:atras', alAtras);
  }, [elegido]);

  return (
    <div role="dialog" aria-label="Acceso" className="fixed inset-0 z-50 overflow-y-auto bg-papel">
      <div className="mx-auto flex min-h-full max-w-app flex-col justify-center px-6 py-10">
        <h1 className="text-center text-2xl font-extrabold text-bodega-oscuro">Vende Fácil</h1>

        {!elegido && (
          <>
            <p className="mt-2 text-center text-sm text-tinta/60">¿Quién va a usar la app?</p>
            <div className="mt-8 grid grid-cols-2 gap-5">
              {lista.map((u) => (
                <RecuadroUsuario key={u.id} usuario={u} onClick={() => setElegido(u)} />
              ))}
            </div>
          </>
        )}

        {elegido && (
          <div className="mt-6">
            <PuertaClave
              titulo={`Hola, ${elegido.nombre}`}
              descripcion="Escribe tu contraseña para entrar."
              usuarios={[elegido]}
              verificar={(id, clave) => usuarios.verificarAcceso(id, clave)}
              recuperar={
                elegido.rol === 'administrador' ? (id, rec, nueva) => usuarios.restablecerConClaveRecuperacion(id, rec, nueva) : undefined
              }
              ayudaOlvido="¿Olvidaste tu contraseña? Pídele a un administrador que te la cambie."
              persistir={persistir}
              onAutorizado={onAcceso}
              onCancelar={() => setElegido(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
