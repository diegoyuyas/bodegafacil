'use client';

import { useEffect, useState } from 'react';
import { obtenerContenedor, type ContenedorRepositorios } from '@/infraestructura/sqlite/contenedor';

interface EstadoContenedor {
  contenedor: ContenedorRepositorios | null;
  error: Error | null;
  cargando: boolean;
}

/**
 * Inicializa (o reutiliza) la base de datos local y expone los
 * repositorios a cualquier componente cliente. Todas las pantallas
 * que necesitan leer/escribir datos usan este hook en vez de tocar
 * SQLite directamente.
 */
export function usarContenedor(): EstadoContenedor {
  const [estado, setEstado] = useState<EstadoContenedor>({
    contenedor: null,
    error: null,
    cargando: true,
  });

  useEffect(() => {
    let activo = true;

    obtenerContenedor()
      .then((contenedor) => {
        if (activo) setEstado({ contenedor, error: null, cargando: false });
      })
      .catch((error: unknown) => {
        if (activo) {
          setEstado({
            contenedor: null,
            error: error instanceof Error ? error : new Error(String(error)),
            cargando: false,
          });
        }
      });

    return () => {
      activo = false;
    };
  }, []);

  return estado;
}
