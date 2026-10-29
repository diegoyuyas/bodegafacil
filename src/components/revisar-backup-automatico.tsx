'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { usarContenedor } from '@/hooks/usar-contenedor';
import type { ContenedorRepositorios } from '@/infraestructura/sqlite/contenedor';
import {
  accionAlTocarAviso,
  debeEsperarPorVenta,
  tocaEjecutarBackupAutomatico,
} from '@/core/backup-automatico';
import { hoyLocalSql, horaLocalHHmm } from '@/core/tiempo';
import { ejecutarBackupAutomaticoAhora } from '@/infraestructura/backup-automatico/ejecutar';
import { leerConfigBackupAutomatico, leerPreguntarDestino } from '@/infraestructura/backup-automatico/config';
import { escucharToqueAvisoBackup, reprogramarAvisoBackup } from '@/infraestructura/backup-automatico/aviso';

/** Cada cuánto se vuelve a revisar mientras la app sigue abierta (10 min). */
const INTERVALO_REVISION_MS = 10 * 60 * 1000;
/** Cuánto se queda visible el mensaje final antes de desaparecer solo. */
const DURACION_AVISO_MS = 6000;

type Mensaje =
  | { tipo: 'generando' }
  | { tipo: 'listo' }
  | { tipo: 'info'; texto: string }
  | { tipo: 'error'; texto: string };

/**
 * Se monta una sola vez en layout.tsx. Hace dos cosas:
 *
 * 1. Revisa si toca Backup Automático (según hora y frecuencia configuradas) al abrir la app, y sigue
 *    revisando cada 10 minutos mientras la dejes abierta. Cuando toca, genera el backup (copia en el
 *    teléfono) y, si el interruptor «Preguntar dónde guardar» está activo, abre la pantalla de compartir de
 *    Android para guardarlo en Drive u otro lugar. Si el usuario la cierra, no pasa nada: la copia local ya
 *    quedó guardada y la app sigue normal. Con esa pantalla activa, el backup espera si la persona está en
 *    medio de una venta (Nueva venta / venta por voz) para no taparle el cobro.
 *
 * 2. Deja programada la notificación recordatorio (ver `infraestructura/backup-automatico/aviso.ts`). Al
 *    TOCARLA la app se abre y hace el mismo backup, con el mismo flujo, sin esperar nada.
 *
 * Mientras se genera aparece un mensaje flotante «Generando backup…» (con indicador de carga) y al
 * terminar «Backup generado con éxito». No bloquea la navegación y se quita solo.
 *
 * Nota: sigue sin haber un proceso en segundo plano real (ver `core/backup-automatico.ts`).
 */
export function RevisarBackupAutomatico() {
  const { contenedor } = usarContenedor();
  const pathname = usePathname();
  const ocupado = useRef(false);
  const rutaRef = useRef(pathname);
  const toquePendiente = useRef(false);
  const [toques, setToques] = useState(0);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);

  useEffect(() => {
    rutaRef.current = pathname;
  }, [pathname]);

  // Revisión al abrir la app, cada 10 minutos y cada vez que se cambia de pantalla (para retomar el backup
  // que estaba esperando a que la persona saliera de Nueva venta).
  useEffect(() => {
    if (!contenedor) return;
    void revisar(contenedor);
    const intervalo = setInterval(() => void revisar(contenedor), INTERVALO_REVISION_MS);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenedor, pathname]);

  // El aviso se reprograma al abrir la app (por si cambió el Premium, la hora o el día).
  useEffect(() => {
    if (!contenedor) return;
    void reprogramarAvisoBackup(contenedor);
  }, [contenedor]);

  // Toque en la notificación: se anota y se atiende en cuanto la base esté lista (arranque en frío).
  useEffect(() => {
    let activo = true;
    let dejarDeEscuchar = () => {};
    void escucharToqueAvisoBackup(() => {
      toquePendiente.current = true;
      setToques((n) => n + 1);
    }).then((quitar) => {
      if (activo) dejarDeEscuchar = quitar;
      else quitar();
    });
    return () => {
      activo = false;
      dejarDeEscuchar();
    };
  }, []);

  useEffect(() => {
    if (!contenedor || !toquePendiente.current) return;
    toquePendiente.current = false;
    void alTocarAviso(contenedor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenedor, toques]);

  useEffect(() => {
    if (!mensaje || mensaje.tipo === 'generando') return;
    const temporizador = setTimeout(() => setMensaje(null), DURACION_AVISO_MS);
    return () => clearTimeout(temporizador);
  }, [mensaje]);

  /** Genera el backup mostrando «Generando backup…» y luego el resultado. Nunca se superponen dos. */
  async function generar(c: ContenedorRepositorios, nombreArchivo: string) {
    if (ocupado.current) return;
    ocupado.current = true;
    setMensaje({ tipo: 'generando' });
    try {
      const resultado = await ejecutarBackupAutomaticoAhora(c, nombreArchivo, { compartir: leerPreguntarDestino(c) });
      if (resultado.ok) {
        setMensaje({ tipo: 'listo' });
        await reprogramarAvisoBackup(c); // el aviso de hoy ya no hace falta: se programa el que sigue
      } else {
        // (Además se dispara la notificación de error — ver `ejecutarBackupAutomaticoAhora`.)
        setMensaje({ tipo: 'error', texto: `No se pudo generar el backup: ${resultado.mensaje}` });
      }
    } finally {
      ocupado.current = false;
    }
  }

  async function revisar(c: ContenedorRepositorios) {
    if (ocupado.current) return;
    if (c.plan.obtenerEstado().tipo !== 'premium') return; // Backup Automático es Premium

    const config = leerConfigBackupAutomatico(c);
    if (!tocaEjecutarBackupAutomatico(config, hoyLocalSql(), horaLocalHHmm())) return;

    // Con la pantalla de compartir activa, no se la abre encima de una venta en curso: espera a que salga.
    const abriraPantallaDeCompartir = leerPreguntarDestino(c) && Capacitor.isNativePlatform();
    if (abriraPantallaDeCompartir && debeEsperarPorVenta(rutaRef.current)) return;

    await generar(c, config.nombreArchivo);
  }

  async function alTocarAviso(c: ContenedorRepositorios) {
    if (ocupado.current) return;
    if (c.plan.obtenerEstado().tipo !== 'premium') return;

    const config = leerConfigBackupAutomatico(c);
    const accion = accionAlTocarAviso(config, hoyLocalSql());
    if (accion === 'ninguna') return;
    if (accion === 'ya_hecho') {
      setMensaje({ tipo: 'info', texto: 'El backup de hoy ya se generó.' });
      return;
    }
    await generar(c, config.nombreArchivo); // al tocar el aviso se hace en el momento, sin esperar nada
  }

  return (
    <div
      aria-live="polite"
      className={`fixed inset-x-0 top-4 z-40 mx-auto flex max-w-app justify-center px-5 transition-opacity duration-300 ${
        mensaje ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {mensaje && (
        <div className="flex items-center gap-2 rounded-full border border-linea bg-white px-4 py-2 shadow-md">
          {mensaje.tipo === 'generando' ? (
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-bodega border-t-transparent"
            />
          ) : (
            <span aria-hidden="true">{mensaje.tipo === 'error' ? '⚠️' : '💾'}</span>
          )}
          <p className={`text-xs font-medium ${mensaje.tipo === 'error' ? 'text-alerta' : 'text-tinta'}`}>
            {mensaje.tipo === 'generando' && 'Generando backup…'}
            {mensaje.tipo === 'listo' && 'Backup generado con éxito'}
            {(mensaje.tipo === 'info' || mensaje.tipo === 'error') && mensaje.texto}
          </p>
        </div>
      )}
    </div>
  );
}
