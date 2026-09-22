'use client';

import { useEffect, useRef, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import type { ContenedorRepositorios } from '@/infraestructura/sqlite/contenedor';
import {
  CLAVE_BACKUP_AUTO_ACTIVO,
  CLAVE_BACKUP_AUTO_FRECUENCIA_DIAS,
  CLAVE_BACKUP_AUTO_HORA,
  CLAVE_BACKUP_AUTO_NOMBRE,
  CLAVE_BACKUP_AUTO_ULTIMA_FECHA,
  HORA_BACKUP_PREDETERMINADA,
  tocaEjecutarBackupAutomatico,
  type ConfigBackupAutomatico,
} from '@/core/backup-automatico';
import { hoyLocalSql, horaLocalHHmm } from '@/core/tiempo';
import { ejecutarBackupAutomaticoAhora } from '@/infraestructura/backup-automatico/ejecutar';

/** Cada cuánto se vuelve a revisar mientras la app sigue abierta (10 min). */
const INTERVALO_REVISION_MS = 10 * 60 * 1000;
/** Cuánto se queda visible el aviso flotante antes de desaparecer solo. */
const DURACION_AVISO_MS = 6000;

function leerConfig(contenedor: ContenedorRepositorios): ConfigBackupAutomatico {
  const c = contenedor.configuracion;
  return {
    activo: c.obtenerValor(CLAVE_BACKUP_AUTO_ACTIVO) === '1',
    nombreArchivo: c.obtenerValor(CLAVE_BACKUP_AUTO_NOMBRE) ?? '',
    hora: c.obtenerValor(CLAVE_BACKUP_AUTO_HORA) ?? HORA_BACKUP_PREDETERMINADA,
    frecuenciaDias: Number(c.obtenerValor(CLAVE_BACKUP_AUTO_FRECUENCIA_DIAS) ?? '1'),
    ultimaFecha: c.obtenerValor(CLAVE_BACKUP_AUTO_ULTIMA_FECHA),
  };
}

/**
 * Se monta una sola vez en layout.tsx.
 *
 * Revisa si toca Backup Automático (según hora y frecuencia
 * configuradas) al abrir la app, y sigue revisando cada 10 minutos
 * mientras la app quede abierta — así, si el bodeguero deja Vende
 * Fácil abierto y la hora configurada llega mientras tanto (por
 * ejemplo, la abrió a las 7am con la hora puesta en 8am), el backup
 * igual se ejecuta sin necesidad de cerrar y volver a abrir la app.
 * La revisión periódica es lo que decide CUÁNDO toca; el aviso de
 * abajo es solo lo que se ve en pantalla en ese momento.
 *
 * Cuando toca, el backup se guarda de una — el aviso flotante que
 * aparece es solo informativo (no tiene botón "Aceptar" ni nada que
 * confirmar) y desaparece solo a los pocos segundos. No bloquea la
 * navegación: el bodeguero puede seguir usando la app con el aviso
 * ahí abajo.
 *
 * Nota: esto SOLO cubre mientras la app está abierta — sigue sin
 * haber un proceso en segundo plano real (ver `core/backup-automatico.ts`).
 */
export function RevisarBackupAutomatico() {
  const { contenedor } = usarContenedor();
  const revisando = useRef(false);
  const [avisoHora, setAvisoHora] = useState<string | null>(null);

  useEffect(() => {
    if (!contenedor) return;

    void revisar(contenedor);
    const intervalo = setInterval(() => void revisar(contenedor), INTERVALO_REVISION_MS);
    return () => clearInterval(intervalo);
  }, [contenedor]);

  useEffect(() => {
    if (!avisoHora) return;
    const temporizador = setTimeout(() => setAvisoHora(null), DURACION_AVISO_MS);
    return () => clearTimeout(temporizador);
  }, [avisoHora]);

  async function revisar(c: ContenedorRepositorios) {
    // Evita dos revisiones superpuestas (por ejemplo si el intervalo
    // dispara justo mientras la anterior todavía está guardando).
    if (revisando.current) return;
    if (c.plan.obtenerEstado().tipo !== 'premium') return; // Backup Automático es Premium

    const config = leerConfig(c);
    const horaActual = horaLocalHHmm();
    if (!tocaEjecutarBackupAutomatico(config, hoyLocalSql(), horaActual)) return;

    revisando.current = true;
    try {
      const resultado = await ejecutarBackupAutomaticoAhora(c, config.nombreArchivo);
      // El aviso solo se muestra si el backup salió bien — si falló,
      // ya se dispara la notificación de error correspondiente (ver
      // `ejecutarBackupAutomaticoAhora`), que sí necesita que el
      // bodeguero se entere y actúe.
      if (resultado.ok) setAvisoHora(config.hora);
    } finally {
      revisando.current = false;
    }
  }

  return (
    <div
      aria-live="polite"
      className={`fixed inset-x-0 top-4 z-40 mx-auto flex max-w-app justify-center px-5 transition-opacity duration-300 ${
        avisoHora ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {avisoHora && (
        <div className="flex items-center gap-2 rounded-full border border-linea bg-white px-4 py-2 shadow-md">
          <span aria-hidden="true">💾</span>
          <p className="text-xs font-medium text-tinta">
            Backup automático generado a las {avisoHora}, según tu configuración.
          </p>
        </div>
      )}
    </div>
  );
}
