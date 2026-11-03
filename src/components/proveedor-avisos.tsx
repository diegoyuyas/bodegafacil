'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { duracionAvisoMs, textoExito, type TipoAviso } from '@/core/avisos';
import { CLAVE_VIBRACION, vibracionActiva, type TipoVibracion } from '@/core/vibracion';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { vibrar as vibrarCelular } from '@/infraestructura/vibracion/vibrar';

interface OpcionesAviso {
  /** 'exito' (por defecto, verde con ✓), 'error' (rojo) o 'info' (oscuro). */
  tipo?: TipoAviso;
  /** Vibración corta junto con el aviso (si la opción está activada en Configuración). */
  vibrar?: TipoVibracion;
}

interface ContextoAvisos {
  /** Muestra un aviso breve sobre la pantalla (se quita solo). Un aviso nuevo reemplaza al anterior. */
  avisar: (texto: string, opciones?: OpcionesAviso) => void;
  /** Solo vibra (sin aviso), respetando la opción de Configuración. */
  vibrar: (tipo: TipoVibracion) => void;
}

const Contexto = createContext<ContextoAvisos>({ avisar: () => {}, vibrar: () => {} });

export function usarAvisos(): ContextoAvisos {
  return useContext(Contexto);
}

const COLOR_AVISO: Record<TipoAviso, string> = {
  exito: 'bg-ok',
  error: 'bg-alerta',
  info: 'bg-tinta',
};

/**
 * Avisos de la app: «Venta guardada ✓» y similares, con animación suave. Vive en el layout, así
 * el aviso sobrevive al cambiar de pantalla (por ejemplo, guardar una compra y volver a la lista).
 */
export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const { contenedor } = usarContenedor();
  const [aviso, setAviso] = useState<{ id: number; texto: string; tipo: TipoAviso } | null>(null);
  const temporizador = useRef<number | null>(null);
  const contador = useRef(0);

  const vibrar = useCallback(
    (tipo: TipoVibracion) => {
      let valor: string | null = null;
      try {
        valor = contenedor ? contenedor.configuracion.obtenerValor(CLAVE_VIBRACION) : null;
      } catch {
        valor = null;
      }
      vibrarCelular(tipo, vibracionActiva(valor));
    },
    [contenedor],
  );

  const avisar = useCallback(
    (texto: string, opciones: OpcionesAviso = {}) => {
      const tipo = opciones.tipo ?? 'exito';
      const textoFinal = tipo === 'exito' ? textoExito(texto) : texto;
      contador.current += 1;
      setAviso({ id: contador.current, texto: textoFinal, tipo });
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
      temporizador.current = window.setTimeout(() => setAviso(null), duracionAvisoMs(textoFinal));
      if (opciones.vibrar) vibrar(opciones.vibrar);
    },
    [vibrar],
  );

  useEffect(
    () => () => {
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    },
    [],
  );

  const valor = useMemo(() => ({ avisar, vibrar }), [avisar, vibrar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {/* El contenedor existe siempre para que los lectores de pantalla anuncien el aviso al aparecer. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-50 mx-auto flex max-w-app justify-center px-5"
        style={{ bottom: 'calc(5rem + var(--area-segura-abajo))' }}
      >
        {aviso && (
          <div
            key={aviso.id}
            className={`animar-aviso rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-lg ${COLOR_AVISO[aviso.tipo]}`}
          >
            {aviso.texto}
          </div>
        )}
      </div>
    </Contexto.Provider>
  );
}
