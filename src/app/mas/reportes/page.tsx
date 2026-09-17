'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import type { EstadoPlan } from '@/core/plan';
import type { CompraListaItem, HistorialCostoItem, MovimientoCaja, Producto, ProductoMasVendidoItem } from '@/core/tipos';
import { hoyLocalSql } from '@/core/tiempo';
import {
  construirHojaCaja,
  construirHojaComprasDetallado,
  construirHojaHistorialCostos,
  construirHojaMasVendidos,
} from '@/core/exportacion';
import { generarLibroExcel } from '@/infraestructura/exportacion/excel';
import { descargarExcel } from '@/infraestructura/exportacion/descargas';

const PESTANAS = [
  { valor: 'caja', etiqueta: 'Caja' },
  { valor: 'compras', etiqueta: 'Compras' },
  { valor: 'productos', etiqueta: 'Más vendidos' },
  { valor: 'costos', etiqueta: 'Costos' },
] as const;

type Pestana = (typeof PESTANAS)[number]['valor'];

export default function PaginaReportes() {
  const { contenedor, cargando, error } = usarContenedor();
  const [simboloMoneda, setSimboloMoneda] = useState(obtenerSimboloMoneda(null));

  useEffect(() => {
    if (!contenedor) return;
    setSimboloMoneda(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
  }, [contenedor]);
  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [pestana, setPestana] = useState<Pestana>('caja');

  const [desde, setDesde] = useState(hoyLocalSql());
  const [hasta, setHasta] = useState(hoyLocalSql());
  const rangoInvalido = Boolean(desde && hasta && desde > hasta);

  const [movimientosCaja, setMovimientosCaja] = useState<MovimientoCaja[]>([]);
  const [compras, setCompras] = useState<CompraListaItem[]>([]);
  const [masVendidos, setMasVendidos] = useState<ProductoMasVendidoItem[]>([]);

  // Historial de costos (Premium): elige un producto y ve lo que costó
  // cada vez que se compró, dentro del mismo rango de fechas de arriba.
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [productoElegido, setProductoElegido] = useState<Producto | null>(null);
  const [historialCostos, setHistorialCostos] = useState<HistorialCostoItem[]>([]);

  useEffect(() => {
    if (!contenedor) return;
    setEstadoPlan(contenedor.plan.obtenerEstado());
    setProductos(contenedor.productos.listarTodos());
  }, [contenedor]);

  const esPremium = estadoPlan?.tipo === 'premium';

  function consultar() {
    if (!contenedor || rangoInvalido || !desde || !hasta) return;
    setMovimientosCaja(contenedor.caja.listarMovimientosPorRango(desde, hasta));
    setCompras(contenedor.compras.listarPorRango(desde, hasta));
    setMasVendidos(contenedor.ventas.listarProductosMasVendidos(desde, hasta));
  }

  useEffect(consultar, [contenedor, desde, hasta, rangoInvalido]);

  useEffect(() => {
    if (!contenedor || !esPremium || !productoElegido || rangoInvalido || !desde || !hasta) {
      setHistorialCostos([]);
      return;
    }
    setHistorialCostos(contenedor.compras.listarHistorialCostos(productoElegido.id, desde, hasta));
  }, [contenedor, esPremium, productoElegido, desde, hasta, rangoInvalido]);

  const resultadosBusquedaProducto = useMemo(() => {
    const texto = busquedaProducto.trim().toLowerCase();
    if (!texto) return [];
    return productos.filter((p) => p.nombre.toLowerCase().includes(texto)).slice(0, 8);
  }, [busquedaProducto, productos]);

  function elegirProducto(producto: Producto) {
    setProductoElegido(producto);
    setBusquedaProducto('');
  }

  async function descargarExcelDelReporte() {
    if (!esPremium || !contenedor) return;
    if (pestana === 'costos') {
      if (!productoElegido || historialCostos.length === 0) return;
      const hoja = construirHojaHistorialCostos(productoElegido.nombre, historialCostos);
      const libro = generarLibroExcel([hoja]);
      await descargarExcel(`costos-${productoElegido.nombre}-${desde}-a-${hasta}.xlsx`, libro);
      return;
    }
    if (pestana === 'compras') {
      // Mismo detalle línea por línea que "Exportar todo a Excel", pero
      // acotado al rango de fechas elegido acá arriba.
      const detalle = contenedor.compras.listarDetalleParaExportar(
        desde || undefined,
        hasta || undefined,
      );
      const libro = generarLibroExcel([construirHojaComprasDetallado(detalle)]);
      await descargarExcel(`reporte-compras-${desde}-a-${hasta}.xlsx`, libro);
      return;
    }
    const hoja = pestana === 'caja' ? construirHojaCaja(movimientosCaja) : construirHojaMasVendidos(masVendidos);
    const libro = generarLibroExcel([hoja]);
    await descargarExcel(`reporte-${pestana}-${desde}-a-${hasta}.xlsx`, libro);
  }

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

  const botonExcelDeshabilitado =
    !esPremium || rangoInvalido || (pestana === 'costos' && (!productoElegido || historialCostos.length === 0));

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

      <>
          <div className="mt-4 flex flex-wrap gap-2">
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

          {pestana !== 'costos' && (
            <button
              onClick={descargarExcelDelReporte}
              disabled={botonExcelDeshabilitado}
              className={`mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-40 ${
                esPremium ? 'bg-bodega text-white active:bg-bodega-oscuro' : 'border border-linea text-tinta/60'
              }`}
            >
              {esPremium ? 'Descargar Excel ↓' : '🔒 Descargar Excel (Premium)'}
            </button>
          )}

          {pestana === 'caja' && (
            <section className="mt-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-bodega-claro/40 px-3 py-3 text-center">
                  <p className="text-xs text-tinta/60">Ingresos</p>
                  <p className="text-sm font-extrabold text-bodega-oscuro">
                    {formatearMonto(totalesCaja.ingresos, simboloMoneda)}
                  </p>
                </div>
                <div className="rounded-xl bg-alerta/10 px-3 py-3 text-center">
                  <p className="text-xs text-tinta/60">Egresos</p>
                  <p className="text-sm font-extrabold text-alerta">
                    {formatearMonto(totalesCaja.egresos, simboloMoneda)}
                  </p>
                </div>
                <div className="rounded-xl border border-linea px-3 py-3 text-center">
                  <p className="text-xs text-tinta/60">Neto</p>
                  <p className="text-sm font-extrabold text-tinta">
                    {formatearMonto(totalesCaja.neto, simboloMoneda)}
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
                          {mov.tipo === 'ingreso' ? '+' : '−'} {formatearMonto(mov.monto, simboloMoneda)}
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
                <p className="text-2xl font-extrabold text-tinta">{formatearMonto(totalCompras, simboloMoneda)}</p>
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
                        <span className="font-semibold text-tinta">{formatearMonto(compra.total, simboloMoneda)}</span>
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
                            {item.cantidadVendida} vendidas · ganancia {formatearMonto(item.gananciaTotal, simboloMoneda)}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-tinta">
                        {formatearMonto(item.totalVendido, simboloMoneda)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {pestana === 'costos' && (
            <section className="mt-4">
              {!esPremium ? (
                <p className="border-y border-linea py-6 text-center text-sm text-tinta/50">
                  🔒 El historial de costos es una función Premium.
                </p>
              ) : (
                <>
                  <div className="relative">
                    {productoElegido ? (
                      <div className="flex items-center justify-between rounded-xl border border-linea bg-white px-4 py-3">
                        <div>
                          <p className="text-sm text-tinta">{productoElegido.nombre}</p>
                          <p className="text-xs text-tinta/50">
                            Costo actual: {formatearMonto(productoElegido.costo, simboloMoneda)}
                          </p>
                        </div>
                        <button
                          onClick={() => setProductoElegido(null)}
                          className="text-tinta/40"
                          aria-label="Quitar producto"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          value={busquedaProducto}
                          onChange={(e) => setBusquedaProducto(e.target.value)}
                          placeholder="Buscar producto…"
                          className="h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
                        />
                        {resultadosBusquedaProducto.length > 0 && (
                          <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-linea bg-white shadow-sm">
                            {resultadosBusquedaProducto.map((producto) => (
                              <li key={producto.id}>
                                <button
                                  onClick={() => elegirProducto(producto)}
                                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
                                >
                                  <span>{producto.nombre}</span>
                                  <span className="text-tinta/60">{formatearMonto(producto.costo, simboloMoneda)}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>

                  {productoElegido && (
                    <>
                      <button
                        onClick={descargarExcelDelReporte}
                        disabled={botonExcelDeshabilitado}
                        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-bodega text-sm font-semibold text-white active:bg-bodega-oscuro disabled:opacity-40"
                      >
                        Descargar Excel ↓
                      </button>

                      {historialCostos.length === 0 ? (
                        <p className="mt-4 border-y border-linea py-6 text-center text-sm text-tinta/50">
                          No hay compras registradas de este producto en el rango elegido.
                        </p>
                      ) : (
                        <ul className="mt-4 divide-y divide-linea border-y border-linea">
                          {historialCostos.map((item, indice) => (
                            <li key={`${item.compraId}-${indice}`} className="py-3">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-tinta/80">
                                  {item.proveedorNombre ?? 'Proveedor no especificado'}
                                </span>
                                <span className="font-semibold text-tinta">
                                  {formatearMonto(item.costoUnitario, simboloMoneda)} c/u
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs text-tinta/40">
                                {new Date(item.fecha).toLocaleDateString('es-PE')} · {item.cantidad}{' '}
                                {productoElegido.unidadMedida} · C-{item.compraId}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </>
              )}
            </section>
          )}
        </>
    </div>
  );
}
