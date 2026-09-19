'use client';

import { useEffect, useRef } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import type { ContenedorRepositorios } from '@/infraestructura/sqlite/contenedor';
import {
  CLAVE_BACKUP_AUTO_ACTIVO,
  CLAVE_BACKUP_AUTO_FRECUENCIA_DIAS,
  CLAVE_BACKUP_AUTO_HORA,
  CLAVE_BACKUP_AUTO_NOMBRE,
  CLAVE_BACKUP_AUTO_ULTIMA_FECHA,
  HORA_BACKUP_PREDETERMINADA,
  nombreArchivoBackupAutomatico,
  tocaEjecutarBackupAutomatico,
  type ConfigBackupAutomatico,
} from '@/core/backup-automatico';
import { obtenerNombreTienda, CLAVE_NOMBRE_TIENDA } from '@/core/configuracion';
import { horaLocalCompacta, hoyLocalSql, horaLocalHHmm } from '@/core/tiempo';
import { guardarBinarioLocalSilencioso } from '@/infraestructura/exportacion/descargas';
import { mostrarNotificacionBackupAutomaticoFallido } from '@/infraestructura/notificaciones/notificaciones-navegador';

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
 * Se monta una sola vez en layout.tsx. No renderiza nada: revisa al
 * abrir la app si tocaba Backup Automático y, si tocaba, lo ejecuta
 * en silencio (ver `guardarBinarioLocalSilencioso`) — no hace falta
 * ningún toque del bodeguero, a diferencia de cuando existía la
 * opción de subir a Google Drive.
 */
export function RevisarBackupAutomatico() {
  const { contenedor } = usarContenedor();
  const yaRevisado = useRef(false);

  useEffect(() => {
    if (!contenedor || yaRevisado.current) return;
    yaRevisado.current = true;
    void revisar(contenedor);
  }, [contenedor]);

  async function revisar(c: ContenedorRepositorios) {
    if (c.plan.obtenerEstado().tipo !== 'premium') return; // Backup Automático es Premium

    const config = leerConfig(c);
    if (!tocaEjecutarBackupAutomatico(config, hoyLocalSql(), horaLocalHHmm())) return;

    const nombreArchivo = nombreArchivoBackupAutomatico(config.nombreArchivo, hoyLocalSql(), horaLocalCompacta());

    try {
      const bytes = c.exportarRespaldoCompleto();
      const { ruta } = await guardarBinarioLocalSilencioso(nombreArchivo, bytes);
      c.respaldos.registrar('automatico', 'completado', ruta, bytes.length);
      c.configuracion.establecerValor(CLAVE_BACKUP_AUTO_ULTIMA_FECHA, hoyLocalSql());
      await c.persistir();
    } catch (e) {
      c.respaldos.registrar('automatico', 'fallido', null, null);
      await c.persistir();
      const nombreTienda = obtenerNombreTienda(c.configuracion.obtenerValor(CLAVE_NOMBRE_TIENDA));
      mostrarNotificacionBackupAutomaticoFallido(
        e instanceof Error ? e.message : 'error desconocido',
        nombreTienda,
      );
    }
  }

  return null;
}
