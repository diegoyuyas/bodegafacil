'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import type { EstadoPlan } from '@/core/plan';
import type { CompraListaItem, MovimientoCaja, ProductoMasVendidoItem } from '@/core/tipos';
import { hoyLocalSql } from '@/core/tiempo';

const PESTANAS = [
  { valor: 'caja', etiqueta: 'Caja' },
  { valor: 'compras', etiqueta: 'Compras' },
  { valor: 'productos', etiqueta: 'Más vendidos' },
] as const;

type Pestana = (typeof PESTANAS)[number]['valor'];

function formatearSoles(monto: number): string {
  return `S/ ${monto.toFixed(2)}`;
}

export default function PaginaReportes() {
  const { contenedor, cargando, error } = usarContenedor();
  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [pestana, setPestana] = useState<Pestana>('caja');

  const [desde, setDesde] = useState(hoyLocalSql());
  const [hasta, setHasta] = useState(hoyLocalSql());
  const rangoInvalido = Boolean(desde && hasta && desde > hasta);

  const [movimientosCaja, setMovimientosCaja] = useState<MovimientoCaja[]>([]);
  const [compras, setCompras] = useState<CompraListaItem[]>([]);
  const [masVendidos, setMasVendidos] = useState<ProductoMasVendidoItem[]>([]);

  useEffect(() => {
    if (!contenedor) return;
    setEstadoPlan(contenedor.plan.obtenerEstado());
  }, [contenedor]);

  const esPremium = estadoPlan?.tipo === 'premium';

  function consultar() {
    if (!contenedor || !esPremium || rangoInvalido || !desde || !hasta) return;
    setMovimientosCaja(contenedor.caja.listarMovimientosPorRango(desde, hasta));
    setCompras(contenedor.compras.listarPorRango(desde, hasta));
    setMasVendidos(contenedor.ventas.listarProductosMasVendidos(desde, hasta));
  }

  useEffect(consultar, [contenedor, esPremium, desde, hasta, rangoInvalido]);

  const totalesCaja = useMemo(() => {
    const ingresos = movimientosCaja
      .filter((m) => m.tipo === 'ingreso')
      .reduce((suma, m) => suma + m.monto, 0);
    const egresos = movimientosCaja
      .filter((m) => m.tipo === 'egreso')
      .reduce((suma, m) => suma + m.monto, 0);
    return { ingresos, egresos, neto: ingresos - egresos };
  }, [movimientosCaja]);

  const totalCompras = useMemo(
    () => compras.reduce((suma, c) => suma + c.total, 0),
    [compras],
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Reportes</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta/60">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      {estadoPlan && !esPremium && (
        <section className="mt-6 rounded-xl border border-linea p-5 text-center">
          <p className="text-sm font-semibold text-tinta">Reportes es una función Premium</p>
          <p className="mt-2 text-xs text-tinta/60">
            Caja, compras y productos más vendidos por rango de fechas están disponibles al
            activar el Plan Premium.
          </p>
        </section>
      )}

      {esPremium && (
        <>
          <div className="mt-4 flex gap-2">
            {PESTANAS.map((p) => (
              <button
                key={p.valor}
                onClick={() => setPestana(p.valor)}
                className={`h-9 flex-1 rounded-full border text-sm font-medium ${
                  pestana === p.valor
                    ? 'border-bodega bg-bodega text-white'
                    : 'border-linea text-tinta/70'
                }`}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-linea p-3">
            <p className="text-xs font-semibold text-tinta/70">Rango de fechas</p>
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
          </div>

          {pestana === 'caja' && (
            <section className="mt-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-bodega-claro/40 px-3 py-3 text-center">
                  <p className="text-xs text-tinta/60">Ingresos</p>
                  <p className="text-sm font-extrabold text-bodega-oscuro">
                    {formatearSoles(totalesCaja.ingresos)}
                  </p>
                </div>
                <div className="rounded-xl bg-alerta/10 px-3 py-3 text-center">
                  <p className="text-xs text-tinta/60">Egresos</p>
                  <p className="text-sm font-extrabold text-alerta">
                    {formatearSoles(totalesCaja.egresos)}
                  </p>
                </div>
                <div className="rounded-xl border border-linea px-3 py-3 text-center">
                  <p className="text-xs text-tinta/60">Neto</p>
                  <p className="text-sm font-extrabold text-tinta">
                    {formatearSoles(totalesCaja.neto)}
                  </p>
                </div>
              </div>

              {movimientosCaja.length === 0 ? (
                <p className="mt-4 border-y border-linea py-6 text-center text-sm text-tinta/50">
                  No hay movimientos de caja en este rango.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-linea border-y border-linea">
                  {movimientosCaja.map((mov) => (
                    <li key={mov.id} className="py-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-tinta/80">{mov.concepto}</span>
                        <span
                          className={`font-semibold ${mov.tipo === 'ingreso' ? 'text-bodega-oscuro' : 'text-alerta'}`}
                        >
                          {mov.tipo === 'ingreso' ? '+' : '−'} {formatearSoles(mov.monto)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-tinta/40">
                        {new Date(mov.fechaHora).toLocaleString('es-PE')}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {pestana === 'compras' && (
            <section className="mt-4">
              <div className="rounded-xl border border-linea px-4 py-3">
                <p className="text-xs text-tinta/60">Total comprado en el rango</p>
                <p className="text-2xl font-extrabold text-tinta">{formatearSoles(totalCompras)}</p>
              </div>

              {compras.length === 0 ? (
                <p className="mt-4 border-y border-linea py-6 text-center text-sm text-tinta/50">
                  No hay compras registradas en este rango.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-linea border-y border-linea">
                  {compras.map((compra) => (
                    <li key={compra.id} className="py-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-tinta/80">
                          {compra.proveedorNombre ?? 'Proveedor no especificado'}
                        </span>
                        <span className="font-semibold text-tinta">{formatearSoles(compra.total)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-tinta/40">
                        {new Date(compra.fecha).toLocaleDateString('es-PE')}
                        {compra.comprobante ? ` · ${compra.comprobante}` : ''}
                        {compra.estado === 'anulada' ? ' · Anulada' : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {pestana === 'productos' && (
            <section className="mt-4">
              {masVendidos.length === 0 ? (
                <p className="border-y border-linea py-6 text-center text-sm text-tinta/50">
                  No hay ventas registradas en este rango.
                </p>
              ) : (
                <ul className="divide-y divide-linea border-y border-linea">
                  {masVendidos.map((item, indice) => (
                    <li key={item.productoId} className="flex items-center justify-between py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="w-5 shrink-0 text-sm font-semibold text-tinta/40">
                          {indice + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm text-tinta">{item.nombre}</p>
                          <p className="text-xs text-tinta/50">
                            {item.cantidadVendida} vendidas · ganancia {formatearSoles(item.gananciaTotal)}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-tinta">
                        {formatearSoles(item.totalVendido)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
