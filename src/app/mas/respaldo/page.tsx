'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { restaurarRespaldo } from '@/infraestructura/sqlite/contenedor';
import { descargarBinario, descargarTexto, leerArchivoComoBytes } from '@/infraestructura/exportacion/descargas';
import { exportarFiadosACsv, exportarProductosACsv, exportarVentasACsv } from '@/core/exportacion';
import { hoyLocalSql } from '@/core/tiempo';

function fechaParaNombreArchivo(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PaginaRespaldo() {
  const { contenedor, cargando, error } = usarContenedor();
  const inputArchivoRef = useRef<HTMLInputElement>(null);
  const [restaurando, setRestaurando] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  // Por defecto, "Desde" y "Hasta" arrancan en la fecha actual del
  // dispositivo (misma fecha local que usa el resto de la app — ver
  // core/tiempo.ts), no vacíos.
  const [desde, setDesde] = useState(hoyLocalSql());
  const [hasta, setHasta] = useState(hoyLocalSql());
  const rangoInvalido = Boolean(desde && hasta && desde > hasta);

  async function exportarVentas() {
    if (!contenedor || rangoInvalido) return;
    const csv = exportarVentasACsv(
      contenedor.ventas.listarDetalleParaExportar(desde || undefined, hasta || undefined),
    );
    await descargarTexto(`ventas-${fechaParaNombreArchivo()}.csv`, csv);
  }

  async function exportarProductos() {
    if (!contenedor) return;
    const csv = exportarProductosACsv(contenedor.productos.listarActivos());
    await descargarTexto(`productos-${fechaParaNombreArchivo()}.csv`, csv);
  }

  async function exportarFiados() {
    if (!contenedor || rangoInvalido) return;
    const csv = exportarFiadosACsv(
      contenedor.fiados.listarClientesConDeuda(desde || undefined, hasta || undefined),
    );
    await descargarTexto(`fiados-${fechaParaNombreArchivo()}.csv`, csv);
  }

  async function descargarRespaldoCompleto() {
    if (!contenedor) return;
    const bytes = contenedor.exportarRespaldoCompleto();
    await descargarBinario(`venta-facil-respaldo-${fechaParaNombreArchivo()}.sqlite`, bytes);
  }

  async function manejarArchivoSeleccionado(archivos: FileList | null) {
    const archivo = archivos?.[0];
    if (!archivo) return;

    const confirmado = window.confirm(
      'Esto reemplazará TODOS los datos actuales de la app con los del respaldo. ¿Continuar?',
    );
    if (!confirmado) {
      if (inputArchivoRef.current) inputArchivoRef.current.value = '';
      return;
    }

    setMensajeError(null);
    setRestaurando(true);
    try {
      const bytes = await leerArchivoComoBytes(archivo);
      await restaurarRespaldo(bytes); // recarga la página si todo sale bien
    } catch (e) {
      setMensajeError(e instanceof Error ? e.message : 'No se pudo restaurar el respaldo.');
      setRestaurando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Respaldo y exportación</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta/60">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      <section className="mt-6">
        <p className="text-sm font-semibold text-tinta">Exportar a CSV</p>
        <p className="mt-1 text-xs text-tinta/50">
          Ábrelos en Excel, Google Sheets o cualquier programa de hojas de cálculo.
        </p>

        <div className="mt-3 rounded-xl border border-linea p-3">
          <p className="text-xs font-semibold text-tinta/70">Rango de fechas (opcional)</p>
          <div className="mt-2 flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-tinta/50">Desde</label>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                max={hasta || undefined}
                className="h-11 w-full rounded-lg border border-linea px-2 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-tinta/50">Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                min={desde || undefined}
                className="h-11 w-full rounded-lg border border-linea px-2 text-sm"
              />
            </div>
          </div>
          {rangoInvalido && (
            <p className="mt-2 text-xs text-alerta">La fecha "desde" no puede ser posterior a "hasta".</p>
          )}
          {(desde || hasta) && !rangoInvalido && (
            <button
              onClick={() => {
                setDesde('');
                setHasta('');
              }}
              className="mt-2 text-xs font-semibold text-bodega-oscuro"
            >
              Quitar filtro de fechas
            </button>
          )}
        </div>

        <div className="mt-3 space-y-2">
          <button
            onClick={exportarVentas}
            disabled={rangoInvalido}
            className="flex h-12 w-full items-center justify-between rounded-xl border border-linea px-4 text-sm font-medium text-tinta disabled:opacity-40"
          >
            Historial de ventas <span className="text-tinta/40">↓</span>
          </button>
          <button
            onClick={exportarProductos}
            className="flex h-12 w-full items-center justify-between rounded-xl border border-linea px-4 text-sm font-medium text-tinta"
          >
            Productos e inventario <span className="text-tinta/40">↓</span>
          </button>
          <button
            onClick={exportarFiados}
            disabled={rangoInvalido}
            className="flex h-12 w-full items-center justify-between rounded-xl border border-linea px-4 text-sm font-medium text-tinta disabled:opacity-40"
          >
            Fiados pendientes <span className="text-tinta/40">↓</span>
          </button>
        </div>
      </section>

      <section className="mt-8">
        <p className="text-sm font-semibold text-tinta">Respaldo completo</p>
        <p className="mt-1 text-xs text-tinta/50">
          Un solo archivo con toda tu bodega: ventas, productos, caja y fiados. Tus datos son
          tuyos — guárdalo donde quieras (correo, WhatsApp, USB).
        </p>
        <button
          onClick={descargarRespaldoCompleto}
          className="mt-3 h-12 w-full rounded-xl bg-bodega text-sm font-semibold text-white active:bg-bodega-oscuro"
        >
          Descargar respaldo completo
        </button>
      </section>

      <section className="mt-8">
        <p className="text-sm font-semibold text-tinta">Restaurar desde un respaldo</p>
        <p className="mt-1 text-xs text-alerta">
          Esto reemplaza todos los datos actuales de la app. Úsalo solo si estás recuperando
          información o cambiando de teléfono.
        </p>
        <input
          ref={inputArchivoRef}
          type="file"
          accept=".sqlite"
          onChange={(e) => manejarArchivoSeleccionado(e.target.files)}
          disabled={restaurando}
          className="mt-3 block w-full text-sm text-tinta/70"
        />
        {restaurando && <p className="mt-2 text-sm text-tinta/60">Restaurando…</p>}
        {mensajeError && <p className="mt-2 text-sm text-alerta">{mensajeError}</p>}
      </section>
    </div>
  );
}
