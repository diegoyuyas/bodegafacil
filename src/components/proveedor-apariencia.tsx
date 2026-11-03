'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CLAVE_APARIENCIA, esOscuroEfectivo, leerApariencia, type Apariencia } from '@/core/apariencia';

interface ContextoApariencia {
  apariencia: Apariencia;
  /** true si ahora mismo la app se dibuja en oscuro (según la preferencia y, en «automático», el teléfono). */
  esOscuro: boolean;
  cambiarApariencia: (nueva: Apariencia) => void;
}

const Contexto = createContext<ContextoApariencia>({
  apariencia: 'claro',
  esOscuro: false,
  cambiarApariencia: () => {},
});

export function usarApariencia(): ContextoApariencia {
  return useContext(Contexto);
}

const CONSULTA_OSCURO = '(prefers-color-scheme: dark)';

function leerGuardada(): Apariencia {
  try {
    return leerApariencia(window.localStorage.getItem(CLAVE_APARIENCIA));
  } catch {
    return 'claro';
  }
}

function sistemaEnOscuro(): boolean {
  try {
    return window.matchMedia(CONSULTA_OSCURO).matches;
  } catch {
    return false;
  }
}

/**
 * Aplica la apariencia elegida (clara, oscura o automática) poniendo o quitando la clase `dark` en
 * `<html>`. La primera pintura ya sale bien gracias al script del `<head>` (ver layout.tsx); esto lo
 * mantiene al día cuando se cambia la opción o el teléfono cambia de modo.
 */
export function ProveedorApariencia({ children }: { children: ReactNode }) {
  const [apariencia, setApariencia] = useState<Apariencia>(() => (typeof window === 'undefined' ? 'claro' : leerGuardada()));
  const [sistemaOscuro, setSistemaOscuro] = useState<boolean>(() => (typeof window === 'undefined' ? false : sistemaEnOscuro()));

  useEffect(() => {
    let consulta: MediaQueryList;
    try {
      consulta = window.matchMedia(CONSULTA_OSCURO);
    } catch {
      return;
    }
    const alCambiar = (e: MediaQueryListEvent) => setSistemaOscuro(e.matches);
    consulta.addEventListener('change', alCambiar);
    return () => consulta.removeEventListener('change', alCambiar);
  }, []);

  const esOscuro = esOscuroEfectivo(apariencia, sistemaOscuro);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', esOscuro);
  }, [esOscuro]);

  const cambiarApariencia = useCallback((nueva: Apariencia) => {
    setApariencia(nueva);
    try {
      window.localStorage.setItem(CLAVE_APARIENCIA, nueva);
    } catch {
      /* si no se puede guardar, igual se aplica mientras la app esté abierta */
    }
  }, []);

  const valor = useMemo(() => ({ apariencia, esOscuro, cambiarApariencia }), [apariencia, esOscuro, cambiarApariencia]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
