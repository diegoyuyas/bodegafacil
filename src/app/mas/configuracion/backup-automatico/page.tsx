'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import type { EstadoPlan } from '@/core/plan';
import {
  CLAVE_BACKUP_AUTO_ACTIVO,
  CLAVE_BACKUP_AUTO_FRECUENCIA_DIAS,
  CLAVE_BACKUP_AUTO_HORA,
  CLAVE_BACKUP_AUTO_NOMBRE,
  FRECUENCIA_BACKUP_MAXIMA_DIAS,
  FRECUENCIA_BACKUP_MINIMA_DIAS,
  HORA_BACKUP_PREDETERMINADA,
  frecuenciaBackupValida,
  nombreArchivoBackupAutomatico,
} from '@/core/backup-automatico';
import { horaLocalCompacta, hoyLocalSql } from '@/core/tiempo';

function fechaHoraLegible(fechaHoraSql: string): string {
  const [fecha = '', hora = ''] = fechaHoraSql.split(' ');
  const [anio = '', mes = '', dia = ''] = fecha.split('-');
  return `${dia}-${mes}-${anio} ${hora.slice(0, 5)}`;
}

export default function PaginaConfigurarBackupAutomatico() {
  const { contenedor, cargando, error } = usarContenedor();

  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [activo, setActivo] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [hora, setHora] = useState(HORA_BACKUP_PREDETERMINADA);
  const [frecuenciaDias, setFrecuenciaDias] = useState('1');
  const [ultimoBackup, setUltimoBackup] = useState<string | null>(null);

  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [mensajeEsError, setMensajeEsError] = useState(false);

  useEffect(() => {
    if (!contenedor) return;
    const c = contenedor.configuracion;
    setEstadoPlan(contenedor.plan.obtenerEstado());
    setActivo(c.obtenerValor(CLAVE_BACKUP_AUTO_ACTIVO) === '1');
    setNombreArchivo(c.obtenerValor(CLAVE_BACKUP_AUTO_NOMBRE) ?? '');
    setHora(c.obtenerValor(CLAVE_BACKUP_AUTO_HORA) ?? HORA_BACKUP_PREDETERMINADA);
    setFrecuenciaDias(c.obtenerValor(CLAVE_BACKUP_AUTO_FRECUENCIA_DIAS) ?? '1');

    const ultimo = contenedor.respaldos.obtenerUltimoAutomaticoExitoso();
    setUltimoBackup(ultimo ? fechaHoraLegible(ultimo.fechaHora) : null);
  }, [contenedor]);

  const esPremium = estadoPlan?.tipo === 'premium';
  const frecuenciaNumero = Number(frecuenciaDias);
  const frecuenciaEsValida = frecuenciaBackupValida(frecuenciaNumero);

  async function guardar() {
    if (!contenedor || !esPremium) return;
    setMensaje(null);

    if (activo && !frecuenciaEsValida) {
      setMensajeEsError(true);
      setMensaje(
        `La frecuencia es obligatoria: un número entero entre ${FRECUENCIA_BACKUP_MINIMA_DIAS} y ${FRECUENCIA_BACKUP_MAXIMA_DIAS} días.`,
      );
      return;
    }

    setGuardando(true);
    const c = contenedor.configuracion;
    c.establecerValor(CLAVE_BACKUP_AUTO_ACTIVO, activo ? '1' : '0');
    c.establecerValor(CLAVE_BACKUP_AUTO_NOMBRE, nombreArchivo.trim());
    c.establecerValor(CLAVE_BACKUP_AUTO_HORA, hora);
    c.establecerValor(CLAVE_BACKUP_AUTO_FRECUENCIA_DIAS, String(frecuenciaNumero));
    await contenedor.persistir();
    setGuardando(false);
    setMensajeEsError(false);
    setMensaje('Configuración guardada.');
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas/configuracion" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Backup Automático</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta/60">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      <p className="mt-4 text-sm text-tinta/70">
        Respalda tu base de datos sola, cada cierto número de días, en el almacenamiento del
        teléfono. Se ejecuta al abrir la app (si tocaba según la hora y frecuencia de abajo) — si un
        día no abres Vende Fácil, ese día no hay backup.
      </p>

      {estadoPlan && !esPremium && (
        <section className="mt-6 rounded-xl border border-linea p-5 text-center">
          <p className="text-sm font-semibold text-tinta">Backup Automático es una función Premium</p>
          <p className="mt-2 text-xs text-tinta/60">Actívala desde el panel de administrador.</p>
        </section>
      )}

      {esPremium && (
        <>
          {ultimoBackup && (
            <p className="mt-4 text-xs text-tinta/50">Último backup automático: {ultimoBackup}</p>
          )}

          <section className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-linea p-4">
            <p className="text-sm font-semibold text-tinta">Activar Backup Automático</p>
            <button
              type="button"
              role="switch"
              aria-checked={activo}
              onClick={() => setActivo((v) => !v)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                activo ? 'bg-bodega' : 'bg-linea'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-150 ${
                  activo ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </section>

          <section className="mt-6">
            <p className="text-sm font-semibold text-tinta">Nombre del archivo</p>
            <p className="mt-0.5 text-xs text-tinta/50">
              Si lo dejas vacío se usa:{' '}
              {nombreArchivoBackupAutomatico('', hoyLocalSql(), horaLocalCompacta())}
            </p>
            <input
              value={nombreArchivo}
              onChange={(e) => setNombreArchivo(e.target.value)}
              placeholder="respaldo-vende-facil-dd-mm-aaaa-hhmmss"
              maxLength={60}
              className="mt-2 h-11 w-full rounded-xl border border-linea px-3 text-sm"
            />
          </section>

          <section className="mt-6">
            <p className="text-sm font-semibold text-tinta">Hora del backup</p>
            <input
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-linea px-3 text-sm"
            />
          </section>

          <section className="mt-6">
            <p className="text-sm font-semibold text-tinta">Frecuencia (cada cuántos días)</p>
            <p className="mt-0.5 text-xs text-tinta/50">Obligatorio. Por ejemplo, 2 = cada 2 días.</p>
            <input
              type="number"
              inputMode="numeric"
              min={FRECUENCIA_BACKUP_MINIMA_DIAS}
              max={FRECUENCIA_BACKUP_MAXIMA_DIAS}
              value={frecuenciaDias}
              onChange={(e) => setFrecuenciaDias(e.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-linea px-3 text-sm"
            />
          </section>

          <p className="mt-4 text-xs text-tinta/50">
            Se guarda en la carpeta Documents/VendeFacil del teléfono. Te pediremos el permiso de
            almacenamiento la primera vez que toque guardar.
          </p>

          {mensaje && (
            <p className={`mt-4 text-sm ${mensajeEsError ? 'text-alerta' : 'text-bodega-oscuro'}`}>{mensaje}</p>
          )}

          <button
            onClick={guardar}
            disabled={guardando}
            className="mt-6 h-12 w-full rounded-xl bg-bodega text-sm font-semibold text-white disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Guardar configuración'}
          </button>
        </>
      )}
    </div>
  );
}
