'use client';

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { usarContenedor } from '@/hooks/usar-contenedor';

/**
 * Gate de acceso: si Más > Configuración > Configurar PIN está
 * activo, no deja ver nada de la app hasta que se ingrese el PIN
 * correcto. Vive en `layout.tsx`, envolviendo `{children}` por dentro
 * de `PantallaSplash` (así el splash sigue cubriendo la carga inicial
 * de la base de datos, y el PIN se pide justo después).
 *
 * Dentro del APK, además se vuelve a bloquear cada vez que la app
 * vuelve de segundo plano (Android puede mantener vivo el WebView al
 * minimizar — sin esto, un PIN que solo se pide "al abrir" no
 * protegería nada si alguien toma el celular con la app ya abierta).
 * En navegador/PWA no aplica: no hay un evento confiable de
 * "segundo plano" ahí, así que solo se bloquea en el arranque.
 */
export function BloqueoPinAcceso({ children }: { children: React.ReactNode }) {
  const { contenedor, cargando } = usarContenedor();

  const [requierePin, setRequierePin] = useState<boolean | null>(null);
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [pin, setPin] = useState('');
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    if (!contenedor) return;
    setRequierePin(contenedor.bloqueoPin.estaActivo());
  }, [contenedor]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive && requierePin) {
        setDesbloqueado(false);
        setPin('');
      }
    });

    return () => {
      listener.then((manejador) => manejador.remove());
    };
  }, [requierePin]);

  async function intentarDesbloquear() {
    if (!contenedor) return;
    setVerificando(true);
    setMensajeError(null);
    const correcto = await contenedor.bloqueoPin.verificar(pin);
    setVerificando(false);
    if (!correcto) {
      setMensajeError('PIN incorrecto.');
      setPin('');
      return;
    }
    setDesbloqueado(true);
  }

  // Mientras se sabe si hace falta PIN (o si no hace falta, o ya se
  // ingresó bien), se deja pasar — el splash ya cubre la espera inicial.
  if (cargando || requierePin === null || !requierePin || desbloqueado) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-papel px-6 text-center">
      <p className="text-lg font-extrabold text-bodega-oscuro">Vende Fácil está bloqueado</p>
      <p className="text-sm text-tinta/60">Ingresa tu PIN de 4 dígitos para continuar.</p>

      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={pin}
        onChange={(e) => {
          setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
          setMensajeError(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && intentarDesbloquear()}
        autoFocus
        className="h-14 w-40 rounded-xl border border-linea text-center text-2xl tracking-[0.5em]"
      />

      {mensajeError && <p className="text-sm text-alerta">{mensajeError}</p>}

      <button
        onClick={intentarDesbloquear}
        disabled={verificando || pin.length !== 4}
        className="h-12 w-40 rounded-full bg-bodega text-sm font-semibold text-white disabled:opacity-50"
      >
        {verificando ? 'Verificando…' : 'Ingresar'}
      </button>
    </div>
  );
}
