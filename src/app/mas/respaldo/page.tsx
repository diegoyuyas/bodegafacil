'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { restaurarRespaldo } from '@/infraestructura/sqlite/contenedor';
import { descargarBinario, descargarExcel, leerArchivoComoBytes } from '@/infraestructura/exportacion/descargas';
import { generarLibroExcel } from '@/infraestructura/exportacion/excel';
import {
  construirHojaCaja,
  construirHojaClientes,
  construirHojaComprasDetallado,
  construirHojaProductos,
  construirHojaProveedores,
  construirHojaVentas,
} from '@/core/exportacion';
import { horaLocalCompacta, hoyLocalSql } from '@/core/tiempo';
import { nombreRespaldoPorDefecto } from '@/core/backup-automatico';
import { CLAVE_ULTIMO_RESPALDO_MANUAL } from '@/core/para-hoy';
import { CLAVE_PLAN_FECHA_MAXIMA_VISTA, CLAVE_PLAN_VENCE_EN, type EstadoPlan } from '@/core/plan';

function fechaParaNombreArchivo(): string {
  return hoyLocalSql();
}

export default function PaginaRespaldo() {
  const { contenedor, cargando, error } = usarContenedor();
  const inputArchivoRef = useRef<HTMLInputElement>(null);
  const [restaurando, setRestaurando] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [respaldoRestaurado, setRespaldoRestaurado] = useState(false);
  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);

  useEffect(() => {
    if (!contenedor) return;
    setEstadoPlan(contenedor.plan.obtenerEstado());
  }, [contenedor]);

  const esPremium = estadoPlan?.tipo === 'premium';

  // Por defecto, "Desde" y "Hasta" arrancan en la fecha actual del
  // dispositivo (misma fecha local que usa el resto de la app — ver
  // core/tiempo.ts), no vacíos.
  const [desde, setDesde] = useState(hoyLocalSql());
  const [hasta, setHasta] = useState(hoyLocalSql());
  const rangoInvalido = Boolean(desde && hasta && desde > hasta);

  // Un solo Excel con todo el negocio. El rango de fechas aplica a lo que tiene fecha (ventas, ventas
  // anuladas, caja y compras); productos, clientes y proveedores salen completos.
  async function exportarTodoAExcel() {
    if (!contenedor || !esPremium || rangoInvalido) return;
    const libro = generarLibroExcel([
      construirHojaVentas(contenedor.ventas.listarDetalleParaExportar(desde || undefined, hasta || undefined)),
      construirHojaVentas(
        contenedor.ventas.listarAnuladasParaExportar(desde || undefined, hasta || undefined),
        'Ventas anuladas',
      ),
      construirHojaCaja(contenedor.caja.listarMovimientosPorRango(desde || '0001-01-01', hasta || hoyLocalSql())),
      construirHojaComprasDetallado(contenedor.compras.listarDetalleParaExportar(desde || undefined, hasta || undefined)),
      construirHojaProductos(contenedor.productos.listarTodos()),
      construirHojaClientes(contenedor.clientes.listarTodos()),
      construirHojaProveedores(contenedor.proveedores.listarTodos()),
    ]);
    await descargarExcel(`venta-facil-completo-${fechaParaNombreArchivo()}.xlsx`, libro);
  }

  async function descargarRespaldoCompleto() {
    if (!contenedor) return;
    const bytes = contenedor.exportarRespaldoCompleto();
    await descargarBinario(`${nombreRespaldoPorDefecto(hoyLocalSql(), horaLocalCompacta())}.sqlite`, bytes);
    // Se anota el día para que Inicio no avise de «falta un respaldo» a quien lo hace a mano.
    contenedor.configuracion.establecerValor(CLAVE_ULTIMO_RESPALDO_MANUAL, hoyLocalSql());
    await contenedor.persistir();
  }

  async function manejarArchivoSeleccionado(archivos: FileList | null) {
    const archivo = archivos?.[0];
    if (!archivo || !contenedor) return;

    const confirmado = window.confirm(
      'Esto reemplazará los datos actuales de la app con los del respaldo (tu Premium actual NO cambia). ¿Continuar?',
    );
    if (!confirmado) {
      if (inputArchivoRef.current) inputArchivoRef.current.value = '';
      return;
    }

    setMensajeError(null);
    setRestaurando(true);
    try {
      const bytes = await leerArchivoComoBytes(archivo);
      // El Premium queda como lo tiene ESTE dispositivo ahora mismo,
      // sin importar lo que traiga el respaldo — ver el comentario en
      // restaurarRespaldo().
      const premiumAConservar = {
        venceEn: contenedor.configuracion.obtenerValor(CLAVE_PLAN_VENCE_EN),
        fechaMaximaVista: contenedor.configuracion.obtenerValor(CLAVE_PLAN_FECHA_MAXIMA_VISTA),
      };
      await restaurarRespaldo(bytes, premiumAConservar);
      // Se vuelve a cargar la app DESDE LA RAÍZ ('/'), no con location.reload(): en el
      // APK, recargar en /mas/respaldo dejaba la app "pegada" en esa ruta mostrando
      // Inicio, y no dejaba volver a entrar a esta opción hasta cerrar la app.
      setRespaldoRestaurado(true);
      setTimeout(() => window.location.replace('/'), 1200);
    } catch (e) {
      setMensajeError(e instanceof Error ? e.message : 'No se pudo restaurar el respaldo.');
      setRestaurando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas" className="text-xl text-tinta-suave" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Respaldo y exportación</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta-suave">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      <section className="mt-6">
        <p className="text-sm font-semibold text-tinta">Exportar todo a Excel</p>
        <p className="mt-1 text-xs text-tinta-suave">
          Un solo archivo Excel con todo tu negocio: productos, clientes, proveedores, ventas, caja y compras, cada
          uno en su propia pestaña.
        </p>

        {estadoPlan && !esPremium && (
          <div className="mt-3 rounded-xl border border-linea p-5 text-center">
            <p className="text-sm font-semibold text-tinta">Exportar todo a Excel es una función Premium</p>
            <p className="mt-2 text-xs text-tinta-suave">Actívala desde el panel de administrador.</p>
          </div>
        )}

        {esPremium && (
          <>
            <div className="mt-3 rounded-xl border border-linea p-3">
              <p className="text-xs font-semibold text-tinta/70">Rango de fechas (opcional)</p>
              <div className="mt-2 flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-tinta-suave">Desde</label>
                  <input
                    type="date"
                    value={desde}
                    onChange={(e) => setDesde(e.target.value)}
                    max={hasta || undefined}
                    className="h-11 w-full rounded-lg border border-linea px-2 text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-tinta-suave">Hasta</label>
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

            <p className="mt-2 text-xs text-tinta-suave">
              {desde || hasta
                ? 'El rango aplica a ventas, ventas anuladas, caja y compras. Productos, clientes y proveedores salen completos.'
                : 'Sin filtro de fechas: se exporta todo el historial.'}
            </p>

            <button
              onClick={exportarTodoAExcel}
              disabled={rangoInvalido}
              className="mt-3 h-12 w-full rounded-xl bg-bodega text-sm font-semibold text-white active:bg-bodega-oscuro disabled:opacity-40"
            >
              Descargar Excel completo ↓
            </button>
          </>
        )}
      </section>

      <section className="mt-8">
        <p className="text-sm font-semibold text-tinta">Respaldo completo</p>
        <p className="mt-1 text-xs text-tinta-suave">
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
        {restaurando && !respaldoRestaurado && <p className="mt-2 text-sm text-tinta-suave">Restaurando…</p>}
        {respaldoRestaurado && (
          <p className="mt-2 text-sm font-semibold text-bodega-oscuro">
            Respaldo restaurado correctamente. Abriendo la app…
          </p>
        )}
        {mensajeError && <p className="mt-2 text-sm text-alerta">{mensajeError}</p>}
      </section>
    </div>
  );
}
