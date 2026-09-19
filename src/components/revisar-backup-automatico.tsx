'use client';

import { useEffect, useRef, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import type { ContenedorRepositorios } from '@/infraestructura/sqlite/contenedor';
import {
  CLAVE_BACKUP_AUTO_ACTIVO,
  CLAVE_BACKUP_AUTO_DESTINO,
  CLAVE_BACKUP_AUTO_FRECUENCIA_DIAS,
  CLAVE_BACKUP_AUTO_HORA,
  CLAVE_BACKUP_AUTO_NOMBRE,
  CLAVE_BACKUP_AUTO_ULTIMA_FECHA,
  HORA_BACKUP_PREDETERMINADA,
  nombreArchivoBackupAutomatico,
  tocaEjecutarBackupAutomatico,
  type ConfigBackupAutomatico,
  type DestinoBackupAutomatico,
} from '@/core/backup-automatico';
import { obtenerNombreTienda, CLAVE_NOMBRE_TIENDA } from '@/core/configuracion';
import { hoyLocalSql, horaLocalHHmm } from '@/core/tiempo';
import { guardarBinarioLocalSilencioso } from '@/infraestructura/exportacion/descargas';
import { conectarConGoogle } from '@/infraestructura/google-drive/autenticacion';
import { subirArchivoADrive } from '@/infraestructura/google-drive/subir-archivo';
import {
  mostrarNotificacionBackupAutomaticoFallido,
  mostrarNotificacionBackupAutomaticoPendienteDrive,
} from '@/infraestructura/notificaciones/notificaciones-navegador';

const MIME_SQLITE = 'application/x-sqlite3';

function leerConfig(contenedor: ContenedorRepositorios): ConfigBackupAutomatico {
  const c = contenedor.configuracion;
  return {
    activo: c.obtenerValor(CLAVE_BACKUP_AUTO_ACTIVO) === '1',
    nombreArchivo: c.obtenerValor(CLAVE_BACKUP_AUTO_NOMBRE) ?? '',
    hora: c.obtenerValor(CLAVE_BACKUP_AUTO_HORA) ?? HORA_BACKUP_PREDETERMINADA,
    frecuenciaDias: Number(c.obtenerValor(CLAVE_BACKUP_AUTO_FRECUENCIA_DIAS) ?? '1'),
    destino: (c.obtenerValor(CLAVE_BACKUP_AUTO_DESTINO) as DestinoBackupAutomatico | null) ?? 'local',
    ultimaFecha: c.obtenerValor(CLAVE_BACKUP_AUTO_ULTIMA_FECHA),
  };
}

export function RevisarBackupAutomatico() {
  const { contenedor } = usarContenedor();
  const yaRevisado = useRef(false);

  const [nombreArchivoPendiente, setNombreArchivoPendiente] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  useEffect(() => {
    if (!contenedor || yaRevisado.current) return;
    yaRevisado.current = true;
    void revisar(contenedor);
  }, [contenedor]);

  async function revisar(c: ContenedorRepositorios) {
    if (c.plan.obtenerEstado().tipo !== 'premium') return; // Backup Automático es Premium

    const config = leerConfig(c);
    if (!tocaEjecutarBackupAutomatico(config, hoyLocalSql(), horaLocalHHmm())) return;

    const nombreTienda = obtenerNombreTienda(c.configuracion.obtenerValor(CLAVE_NOMBRE_TIENDA));
    const nombreArchivo = nombreArchivoBackupAutomatico(config.nombreArchivo, hoyLocalSql());

    if (config.destino === 'local') {
      try {
        const bytes = c.exportarRespaldoCompleto();
        const { ruta } = await guardarBinarioLocalSilencioso(nombreArchivo, bytes);
        c.respaldos.registrar('automatico', 'completado', ruta, bytes.length);
        c.configuracion.establecerValor(CLAVE_BACKUP_AUTO_ULTIMA_FECHA, hoyLocalSql());
        await c.persistir();
      } catch (e) {
        c.respaldos.registrar('automatico', 'fallido', null, null);
        await c.persistir();
        mostrarNotificacionBackupAutomaticoFallido(
          e instanceof Error ? e.message : 'error desconocido',
          nombreTienda,
        );
      }
      return;
    }

    // Destino Drive: Google exige un toque del usuario para autorizar
    // (no hay forma de subir en silencio) — se avisa y se espera al banner.
    setNombreArchivoPendiente(nombreArchivo);
    mostrarNotificacionBackupAutomaticoPendienteDrive(nombreTienda);
  }

  async function subirPendienteADrive() {
    if (!contenedor || !nombreArchivoPendiente) return;
    setSubiendo(true);
    setMensajeError(null);
    const nombreTienda = obtenerNombreTienda(contenedor.configuracion.obtenerValor(CLAVE_NOMBRE_TIENDA));

    try {
      const bytes = contenedor.exportarRespaldoCompleto();
      const token = await conectarConGoogle();
      const subido = await subirArchivoADrive(token.accessToken, nombreArchivoPendiente, bytes, MIME_SQLITE);
      contenedor.respaldos.registrar('automatico', 'completado', subido.enlaceWeb, bytes.length);
      contenedor.configuracion.establecerValor(CLAVE_BACKUP_AUTO_ULTIMA_FECHA, hoyLocalSql());
      await contenedor.persistir();
      setNombreArchivoPendiente(null);
    } catch (e) {
      contenedor.respaldos.registrar('automatico', 'fallido', null, null);
      await contenedor.persistir();
      const motivo = e instanceof Error ? e.message : 'error desconocido';
      setMensajeError(motivo);
      mostrarNotificacionBackupAutomaticoFallido(motivo, nombreTienda);
    } finally {
      setSubiendo(false);
    }
  }

  if (!nombreArchivoPendiente) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 z-30 mx-auto flex max-w-app flex-col gap-2 px-5">
      <div className="rounded-xl border border-bodega bg-white p-3 shadow-lg">
        <p className="text-xs font-semibold text-tinta">Backup automático listo</p>
        <p className="mt-0.5 text-xs text-tinta/60">Toca para subirlo a Google Drive.</p>
        {mensajeError && <p className="mt-1 text-xs text-alerta">{mensajeError}</p>}
        <div className="mt-2 flex gap-2">
          <button
            onClick={subirPendienteADrive}
            disabled={subiendo}
            className="h-9 flex-1 rounded-lg bg-bodega text-xs font-semibold text-white disabled:opacity-50"
          >
            {subiendo ? 'Subiendo…' : 'Subir a Drive'}
          </button>
          <button
            onClick={() => setNombreArchivoPendiente(null)}
            disabled={subiendo}
            className="h-9 rounded-lg border border-linea px-3 text-xs font-semibold text-tinta/70"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
