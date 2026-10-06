'use client';

/**
 * Vende Fácil — Más > Compras (listado)
 * ------------------------------------------------------------
 * Punto de entrada de Compras: lista lo ya registrado (más reciente
 * primero) con buscador y rango de fechas opcional, y desde acá se
 * entra a "Nueva compra" o se Modifica/Anula una ya existente. El
 * registro de una compra nueva vive en /compras/nueva.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { usarSolicitudPin } from '@/hooks/usar-solicitud-pin';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import { hoyLocalSql } from '@/core/tiempo';
import type { CompraListaItem } from '@/core/tipos';

export default function PaginaListadoCompras() {
  const { contenedor, cargando, error } = usarContenedor();
  const { pedirPin, modalPin } = usarSolicitudPin(contenedor);
  const [simboloMoneda, setSimboloMoneda] = useState(obtenerSimboloMoneda(null));
  const [compras, setCompras] = useState<CompraListaItem[]>([]);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  // Igual que en Fiados: por defecto el rango viene puesto en el día
  // de hoy (con el que se está trabajando); se puede ampliar o quitar
  // con el botón "Quitar" para ver todo el historial de compras.
  const [busqueda, setBusqueda] = useState('');
  const [desde, setDesde] = useState(hoyLocalSql());
  const [hasta, setHasta] = useState(hoyLocalSql());
  const rangoInvalido = Boolean(desde) && Boolean(hasta) && desde > hasta;

  useEffect(() => {
    if (!contenedor) return;
    setSimboloMoneda(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
  }, [contenedor]);

  function recargar() {
    if (!contenedor || rangoInvalido) return;
    setCompras(contenedor.compras.listarPorRango(desde || undefined, hasta || undefined));
  }

  useEffect(recargar, [contenedor, desde, hasta, rangoInvalido]);

  const comprasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return compras;
    return compras.filter(
      (c) =>
        (c.proveedorNombre ?? '').toLowerCase().includes(texto) ||
        (c.comprobante ?? '').toLowerCase().includes(texto) ||
        c.productos.toLowerCase().includes(texto) ||
        `c-${c.id}`.includes(texto),
    );
  }, [busqueda, compras]);

  async function anular(compra: CompraListaItem) {
    if (!contenedor) return;
    const confirmar = window.confirm(
      `¿Anular la compra C-${compra.id}? Se retira del stock lo que había entrado y se revierte el gasto de caja.`,
    );
    if (!confirmar) return;
    if (!(await pedirPin('anular', `anular la compra C-${compra.id}`))) return;
    setMensajeError(null);
    try {
      contenedor.compras.anularCompra(compra.id);
      await contenedor.persistir();
      recargar();
    } catch (e) {
      setMensajeError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo anular la compra.');
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      {modalPin}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/mas" className="text-xl text-tinta/60" aria-label="Volver a Más">
            ←
          </Link>
          <h1 className="text-lg font-extrabold text-bodega-oscuro">Compras</h1>
        </div>
        <Link
          href="/compras/nueva"
          className="rounded-full bg-green-600 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white active:bg-green-700"
        >
          Nueva compra
        </Link>
      </header>

      <div className="mt-4">
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
          {(desde || hasta) && (
            <button
              onClick={() => {
                setDesde('');
                setHasta('');
              }}
              className="mt-6 h-11 shrink-0 rounded-lg border border-linea px-3 text-xs font-semibold text-tinta/60"
            >
              Quitar
            </button>
          )}
        </div>
        {rangoInvalido && (
          <p className="mt-2 text-xs text-alerta">La fecha "desde" no puede ser posterior a "hasta".</p>
        )}
      </div>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por proveedor, producto, serie o número…"
        className="mt-3 h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
      />

      {mensajeError && <p className="mt-3 text-sm text-alerta">{mensajeError}</p>}

      <main className="mt-4 flex-1">
        {cargando && <p className="text-sm text-tinta/60">Cargando…</p>}
        {error && <p className="text-sm text-alerta">{error.message}</p>}

        {!cargando && compras.length === 0 && (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta/50">
            Todavía no registras compras.
          </p>
        )}

        {!cargando && compras.length > 0 && comprasFiltradas.length === 0 && (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta/50">
            Ninguna compra coincide con "{busqueda}".
          </p>
        )}

        <ul className="divide-y divide-linea border-y border-linea">
          {comprasFiltradas.map((compra) => {
            const anulada = compra.estado === 'anulada';
            return (
              <li key={compra.id} className="py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-bodega-oscuro">C-{compra.id}</span>
                  <span className={`text-sm font-semibold ${anulada ? 'text-tinta/40 line-through' : 'text-tinta'}`}>
                    {formatearMonto(compra.total, simboloMoneda)}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-tinta/80">
                  {compra.proveedorNombre ?? 'Sin proveedor'}
                </p>
                <p className="mt-0.5 text-xs text-tinta/40">
                  {new Date(compra.fecha.replace(' ', 'T')).toLocaleDateString('es-PE')}
                  {compra.comprobante ? ` · ${compra.comprobante}` : ''}
                  {anulada ? ' · Anulada' : ''}
                </p>

                {!anulada && (
                  <div className="mt-2 flex gap-4">
                    <Link
                      href={`/compras/editar?id=${compra.id}`}
                      className="text-xs font-semibold text-bodega-oscuro"
                    >
                      Modificar
                    </Link>
                    <button
                      onClick={() => anular(compra)}
                      className="text-xs font-semibold text-alerta"
                    >
                      Anular
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
