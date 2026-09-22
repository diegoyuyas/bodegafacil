'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import type { EstadoPlan } from '@/core/plan';
import type {
  HistorialCostoItem,
  MetodoPagoSinFiado,
  MovimientoCaja,
  MovimientoInventarioItem,
  Producto,
  ProductoMasVendidoItem,
} from '@/core/tipos';
import { hoyLocalSql } from '@/core/tiempo';
import type { FilaCompraDetallada, FilaVentaDetallada } from '@/core/exportacion';
import {
  construirHojaCaja,
  construirHojaComprasDetallado,
  construirHojaHistorialCostos,
  construirHojaKardex,
  construirHojaMasVendidos,
  construirHojaVentas,
  desglosarMovimientoInventario,
} from '@/core/exportacion';
import { generarLibroExcel } from '@/infraestructura/exportacion/excel';
import { descargarExcel } from '@/infraestructura/exportacion/descargas';
import { IconoImagen, VisorFotoComprobante } from '@/components/visor-foto-comprobante';

const PESTANAS = [
  { valor: 'ventas', etiqueta: 'Ventas' },
  { valor: 'caja', etiqueta: 'Caja' },
  { valor: 'compras', etiqueta: 'Compras' },
  { valor: 'productos', etiqueta: 'Más vendidos' },
  { valor: 'costos', etiqueta: 'Costos' },
  { valor: 'kardex', etiqueta: 'Kardex' },
] as const;

const ETIQUETAS_METODO_PAGO_REPORTE: Record<string, string> = {
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  tarjeta: 'Tarjeta',
  fiado: 'Fiado',
};

const ETIQUETAS_TIPO_MOVIMIENTO_KARDEX: Record<MovimientoInventarioItem['tipo'], string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  ajuste: 'Ajuste',
};

type Pestana = (typeof PESTANAS)[number]['valor'];

interface VentaAgrupada {
  pedido: string;
  fecha: string;
  cliente: string;
  metodoPago: string;
  comprobanteRuta: string | null;
  lineas: FilaVentaDetallada[];
  total: number;
}

interface CompraAgrupada {
  compra: string;
  fecha: string;
  proveedor: string;
  comprobante: string | null;
  estado: string;
  lineas: FilaCompraDetallada[];
  total: number;
}

export default function PaginaReportes() {
  const { contenedor, cargando, error } = usarContenedor();
  const [simboloMoneda, setSimboloMoneda] = useState(obtenerSimboloMoneda(null));

  useEffect(() => {
    if (!contenedor) return;
    setSimboloMoneda(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
  }, [contenedor]);
  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [pestana, setPestana] = useState<Pestana>('ventas');

  const [desde, setDesde] = useState(hoyLocalSql());
  const [hasta, setHasta] = useState(hoyLocalSql());
  const rangoInvalido = Boolean(desde && hasta && desde > hasta);

  const [detalleVentas, setDetalleVentas] = useState<FilaVentaDetallada[]>([]);
  const [movimientosCaja, setMovimientosCaja] = useState<MovimientoCaja[]>([]);
  const [detalleCompras, setDetalleCompras] = useState<FilaCompraDetallada[]>([]);
  const [masVendidos, setMasVendidos] = useState<ProductoMasVendidoItem[]>([]);

  // Filtros de cada pestaña — todos se aplican sobre lo ya cargado en
  // el rango de fechas de arriba, sin volver a consultar la base.
  const [busquedaVentas, setBusquedaVentas] = useState('');
  // Foto del pago (Yape/Plin) abierta a pantalla completa desde la pestaña Ventas.
  const [fotoAbierta, setFotoAbierta] = useState<{ ruta: string; titulo: string } | null>(null);
  const [filtroMetodoCaja, setFiltroMetodoCaja] = useState<'todos' | MetodoPagoSinFiado>('todos');
  const [busquedaCompras, setBusquedaCompras] = useState('');
  const [busquedaMasVendidos, setBusquedaMasVendidos] = useState('');

  // Historial de costos (Premium): elige un producto y ve lo que costó
  // cada vez que se compró, dentro del mismo rango de fechas de arriba.
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [productoElegido, setProductoElegido] = useState<Producto | null>(null);
  const [historialCostos, setHistorialCostos] = useState<HistorialCostoItem[]>([]);

  // Kardex (Free ver, Premium descargar): mismo patrón de "elegir
  // producto" que Costos, pero con su propio estado — Kardex es
  // visible sin Premium, así que no puede compartir el picker de
  // Costos (que solo se muestra con Premium activo).
  const [busquedaProductoKardex, setBusquedaProductoKardex] = useState('');
  const [productoElegidoKardex, setProductoElegidoKardex] = useState<Producto | null>(null);
  const [movimientosKardex, setMovimientosKardex] = useState<MovimientoInventarioItem[]>([]);

  useEffect(() => {
    if (!contenedor) return;
    setEstadoPlan(contenedor.plan.obtenerEstado());
    setProductos(contenedor.productos.listarTodos());
  }, [contenedor]);

  const esPremium = estadoPlan?.tipo === 'premium';

  function consultar() {
    if (!contenedor || rangoInvalido || !desde || !hasta) return;
    setDetalleVentas(contenedor.ventas.listarDetalleParaExportar(desde, hasta));
    setMovimientosCaja(contenedor.caja.listarMovimientosPorRango(desde, hasta));
    setDetalleCompras(contenedor.compras.listarDetalleParaExportar(desde, hasta));
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

  useEffect(() => {
    if (!contenedor || !productoElegidoKardex || rangoInvalido || !desde || !hasta) {
      setMovimientosKardex([]);
      return;
    }
    setMovimientosKardex(contenedor.productos.listarMovimientosInventario(productoElegidoKardex.id, desde, hasta));
  }, [contenedor, productoElegidoKardex, desde, hasta, rangoInvalido]);

  const resultadosBusquedaProductoKardex = useMemo(() => {
    const texto = busquedaProductoKardex.trim().toLowerCase();
    if (!texto) return [];
    return productos.filter((p) => p.nombre.toLowerCase().includes(texto)).slice(0, 8);
  }, [busquedaProductoKardex, productos]);

  function elegirProductoKardex(producto: Producto) {
    setProductoElegidoKardex(producto);
    setBusquedaProductoKardex('');
  }

  const resultadosBusquedaProducto = useMemo(() => {
    const texto = busquedaProducto.trim().toLowerCase();
    if (!texto) return [];
    return productos.filter((p) => p.nombre.toLowerCase().includes(texto)).slice(0, 8);
  }, [busquedaProducto, productos]);

  function elegirProducto(producto: Producto) {
    setProductoElegido(producto);
    setBusquedaProducto('');
  }

  const ventasAgrupadas = useMemo<VentaAgrupada[]>(() => {
    const mapa = new Map<string, VentaAgrupada>();
    for (const fila of detalleVentas) {
      let grupo = mapa.get(fila.pedido);
      if (!grupo) {
        grupo = {
          pedido: fila.pedido,
          fecha: fila.fecha,
          cliente: fila.cliente,
          metodoPago: fila.metodoPago,
          comprobanteRuta: fila.comprobanteRuta ?? null,
          lineas: [],
          total: 0,
        };
        mapa.set(fila.pedido, grupo);
      }
      grupo.lineas.push(fila);
      grupo.total += fila.subtotal;
    }
    return Array.from(mapa.values());
  }, [detalleVentas]);

  const ventasFiltradas = useMemo(() => {
    const texto = busquedaVentas.trim().toLowerCase();
    if (!texto) return ventasAgrupadas;
    return ventasAgrupadas.filter(
      (v) =>
        v.cliente.toLowerCase().includes(texto) ||
        (ETIQUETAS_METODO_PAGO_REPORTE[v.metodoPago] ?? v.metodoPago).toLowerCase().includes(texto) ||
        v.lineas.some((l) => l.producto.toLowerCase().includes(texto)),
    );
  }, [busquedaVentas, ventasAgrupadas]);

  const totalVentasReporte = useMemo(
    () => ventasFiltradas.reduce((suma, v) => suma + v.total, 0),
    [ventasFiltradas],
  );

  const comprasAgrupadas = useMemo<CompraAgrupada[]>(() => {
    const mapa = new Map<string, CompraAgrupada>();
    for (const fila of detalleCompras) {
      let grupo = mapa.get(fila.compra);
      if (!grupo) {
        grupo = {
          compra: fila.compra,
          fecha: fila.fecha,
          proveedor: fila.proveedor,
          comprobante: fila.comprobante,
          estado: fila.estado,
          lineas: [],
          total: fila.totalCompra,
        };
        mapa.set(fila.compra, grupo);
      }
      grupo.lineas.push(fila);
    }
    return Array.from(mapa.values());
  }, [detalleCompras]);

  const comprasFiltradas = useMemo(() => {
    const texto = busquedaCompras.trim().toLowerCase();
    if (!texto) return comprasAgrupadas;
    return comprasAgrupadas.filter(
      (c) =>
        c.proveedor.toLowerCase().includes(texto) ||
        c.total.toFixed(2).includes(texto) ||
        c.lineas.some((l) => l.producto.toLowerCase().includes(texto)),
    );
  }, [busquedaCompras, comprasAgrupadas]);

  const totalCompras = useMemo(
    () => comprasFiltradas.reduce((suma, c) => suma + c.total, 0),
    [comprasFiltradas],
  );

  const movimientosCajaFiltrados = useMemo(() => {
    if (filtroMetodoCaja === 'todos') return movimientosCaja;
    return movimientosCaja.filter((m) => m.metodoPago === filtroMetodoCaja);
  }, [filtroMetodoCaja, movimientosCaja]);

  const masVendidosFiltrados = useMemo(() => {
    const texto = busquedaMasVendidos.trim().toLowerCase();
    if (!texto) return masVendidos;
    return masVendidos.filter((p) => p.nombre.toLowerCase().includes(texto));
  }, [busquedaMasVendidos, masVendidos]);

  async function descargarExcelDelReporte() {
    if (!esPremium || !contenedor) return;
    if (pestana === 'ventas') {
      const libro = generarLibroExcel([construirHojaVentas(ventasFiltradas.flatMap((v) => v.lineas))]);
      await descargarExcel(`reporte-ventas-${desde}-a-${hasta}.xlsx`, libro);
      return;
    }
    if (pestana === 'costos') {
      if (!productoElegido || historialCostos.length === 0) return;
      const hoja = construirHojaHistorialCostos(productoElegido.nombre, historialCostos);
      const libro = generarLibroExcel([hoja]);
      await descargarExcel(`costos-${productoElegido.nombre}-${desde}-a-${hasta}.xlsx`, libro);
      return;
    }
    if (pestana === 'kardex') {
      if (!productoElegidoKardex || movimientosKardex.length === 0) return;
      const hoja = construirHojaKardex(productoElegidoKardex.nombre, movimientosKardex);
      const libro = generarLibroExcel([hoja]);
      await descargarExcel(`kardex-${productoElegidoKardex.nombre}-${desde}-a-${hasta}.xlsx`, libro);
      return;
    }
    if (pestana === 'compras') {
      const libro = generarLibroExcel([construirHojaComprasDetallado(comprasFiltradas.flatMap((c) => c.lineas))]);
      await descargarExcel(`reporte-compras-${desde}-a-${hasta}.xlsx`, libro);
      return;
    }
    const hoja =
      pestana === 'caja' ? construirHojaCaja(movimientosCajaFiltrados) : construirHojaMasVendidos(masVendidosFiltrados);
    const libro = generarLibroExcel([hoja]);
    await descargarExcel(`reporte-${pestana}-${desde}-a-${hasta}.xlsx`, libro);
  }

  const totalesCaja = useMemo(() => {
    const ingresos = movimientosCajaFiltrados
      .filter((m) => m.tipo === 'ingreso')
      .reduce((suma, m) => suma + m.monto, 0);
    const egresos = movimientosCajaFiltrados
      .filter((m) => m.tipo === 'egreso')
      .reduce((suma, m) => suma + m.monto, 0);
    return { ingresos, egresos, neto: ingresos - egresos };
  }, [movimientosCajaFiltrados]);

  const botonExcelDeshabilitado =
    !esPremium ||
    rangoInvalido ||
    (pestana === 'costos' && (!productoElegido || historialCostos.length === 0)) ||
    (pestana === 'kardex' && (!productoElegidoKardex || movimientosKardex.length === 0)) ||
    (pestana === 'ventas' && ventasFiltradas.length === 0) ||
    (pestana === 'caja' && movimientosCajaFiltrados.length === 0) ||
    (pestana === 'compras' && comprasFiltradas.length === 0) ||
    (pestana === 'productos' && masVendidosFiltrados.length === 0);

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

          {pestana === 'ventas' && (
            <section className="mt-4">
              <input
                value={busquedaVentas}
                onChange={(e) => setBusquedaVentas(e.target.value)}
                placeholder="Buscar por cliente, producto o forma de pago…"
                className="h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
              />

              <div className="mt-3 rounded-xl border border-linea px-4 py-3">
                <p className="text-xs text-tinta/60">Total vendido en el rango</p>
                <p className="text-2xl font-extrabold text-tinta">
                  {formatearMonto(totalVentasReporte, simboloMoneda)}
                </p>
              </div>

              {ventasFiltradas.length === 0 ? (
                <p className="mt-4 border-y border-linea py-6 text-center text-sm text-tinta/50">
                  {busquedaVentas
                    ? `Ninguna venta coincide con "${busquedaVentas}".`
                    : 'No hay ventas registradas en este rango.'}
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-linea border-y border-linea">
                  {ventasFiltradas.map((venta) => (
                    <li key={venta.pedido} className="py-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-tinta/80">
                          {venta.pedido} · {venta.cliente}
                        </span>
                        <span className="font-semibold text-tinta">
                          {formatearMonto(venta.total, simboloMoneda)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="text-xs text-tinta/40">
                          {new Date(venta.fecha).toLocaleString('es-PE')} ·{' '}
                          {ETIQUETAS_METODO_PAGO_REPORTE[venta.metodoPago] ?? venta.metodoPago}
                        </p>
                        {venta.comprobanteRuta && (
                          <button
                            type="button"
                            aria-label={`Ver foto del pago de ${venta.pedido}`}
                            onClick={() =>
                              setFotoAbierta({
                                ruta: venta.comprobanteRuta as string,
                                titulo: `${venta.pedido} · ${ETIQUETAS_METODO_PAGO_REPORTE[venta.metodoPago] ?? venta.metodoPago}`,
                              })
                            }
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-linea text-bodega"
                          >
                            <IconoImagen />
                          </button>
                        )}
                      </div>
                      <div className="mt-1.5 space-y-0.5 pl-2">
                        {venta.lineas.map((linea, i) => (
                          <p key={i} className="text-xs text-tinta/60">
                            {linea.cantidad} × {linea.producto} —{' '}
                            {formatearMonto(linea.subtotal, simboloMoneda)}
                          </p>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {pestana === 'caja' && (
            <section className="mt-4">
              <div>
                <label className="mb-1 block text-xs text-tinta/50">Forma de pago</label>
                <select
                  value={filtroMetodoCaja}
                  onChange={(e) => setFiltroMetodoCaja(e.target.value as 'todos' | MetodoPagoSinFiado)}
                  className="h-11 w-full rounded-xl border border-linea bg-white px-3 text-sm"
                >
                  <option value="todos">Todos</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="yape">Yape</option>
                  <option value="plin">Plin</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
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

              {movimientosCajaFiltrados.length === 0 ? (
                <p className="mt-4 border-y border-linea py-6 text-center text-sm text-tinta/50">
                  No hay movimientos de caja {filtroMetodoCaja !== 'todos' ? 'con esa forma de pago ' : ''}en
                  este rango.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-linea border-y border-linea">
                  {movimientosCajaFiltrados.map((mov) => (
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
              <input
                value={busquedaCompras}
                onChange={(e) => setBusquedaCompras(e.target.value)}
                placeholder="Buscar por proveedor, producto o monto…"
                className="h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
              />

              <div className="mt-3 rounded-xl border border-linea px-4 py-3">
                <p className="text-xs text-tinta/60">Total comprado en el rango</p>
                <p className="text-2xl font-extrabold text-tinta">{formatearMonto(totalCompras, simboloMoneda)}</p>
              </div>

              {comprasFiltradas.length === 0 ? (
                <p className="mt-4 border-y border-linea py-6 text-center text-sm text-tinta/50">
                  {busquedaCompras
                    ? `Ninguna compra coincide con "${busquedaCompras}".`
                    : 'No hay compras registradas en este rango.'}
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-linea border-y border-linea">
                  {comprasFiltradas.map((compra) => (
                    <li key={compra.compra} className="py-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-tinta/80">{compra.proveedor}</span>
                        <span className="font-semibold text-tinta">{formatearMonto(compra.total, simboloMoneda)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-tinta/40">
                        {new Date(compra.fecha).toLocaleDateString('es-PE')}
                        {compra.comprobante ? ` · ${compra.comprobante}` : ''}
                        {compra.estado === 'anulada' ? ' · Anulada' : ''}
                      </p>
                      <div className="mt-1.5 space-y-0.5 pl-2">
                        {compra.lineas.map((linea, i) => (
                          <p key={i} className="text-xs text-tinta/60">
                            {linea.cantidad} × {linea.producto} — {formatearMonto(linea.subtotal, simboloMoneda)}
                          </p>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {pestana === 'productos' && (
            <section className="mt-4">
              <input
                value={busquedaMasVendidos}
                onChange={(e) => setBusquedaMasVendidos(e.target.value)}
                placeholder="Buscar producto…"
                className="h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
              />

              {masVendidosFiltrados.length === 0 ? (
                <p className="mt-4 border-y border-linea py-6 text-center text-sm text-tinta/50">
                  {busquedaMasVendidos
                    ? `Ningún producto coincide con "${busquedaMasVendidos}".`
                    : 'No hay ventas registradas en este rango.'}
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-linea border-y border-linea">
                  {masVendidosFiltrados.map((item, indice) => (
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
          {pestana === 'kardex' && (
            <section className="mt-4">
              <div className="relative">
                {productoElegidoKardex ? (
                  <div className="flex items-center justify-between rounded-xl border border-linea bg-white px-4 py-3">
                    <div>
                      <p className="text-sm text-tinta">{productoElegidoKardex.nombre}</p>
                      <p className="text-xs text-tinta/50">
                        Stock actual: {productoElegidoKardex.stockActual} {productoElegidoKardex.unidadMedida}
                      </p>
                    </div>
                    <button
                      onClick={() => setProductoElegidoKardex(null)}
                      className="text-tinta/40"
                      aria-label="Quitar producto"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      value={busquedaProductoKardex}
                      onChange={(e) => setBusquedaProductoKardex(e.target.value)}
                      placeholder="Buscar producto…"
                      className="h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
                    />
                    {resultadosBusquedaProductoKardex.length > 0 && (
                      <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-linea bg-white shadow-sm">
                        {resultadosBusquedaProductoKardex.map((producto) => (
                          <li key={producto.id}>
                            <button
                              onClick={() => elegirProductoKardex(producto)}
                              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
                            >
                              <span>{producto.nombre}</span>
                              <span className="text-tinta/60">
                                {producto.stockActual} {producto.unidadMedida}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>

              {productoElegidoKardex && (
                <>
                  {!esPremium && (
                    <p className="mt-3 text-center text-xs text-tinta/50">
                      🔒 Descargar el Kardex a Excel es una función Premium — verlo acá es gratis.
                    </p>
                  )}

                  {movimientosKardex.length === 0 ? (
                    <p className="mt-4 border-y border-linea py-6 text-center text-sm text-tinta/50">
                      No hay movimientos de stock de este producto en el rango elegido.
                    </p>
                  ) : (
                    <ul className="mt-4 divide-y divide-linea border-y border-linea">
                      {movimientosKardex.map((m) => {
                        const { entrada, salida } = desglosarMovimientoInventario(m);
                        return (
                          <li key={m.id} className="py-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-tinta/80">{ETIQUETAS_TIPO_MOVIMIENTO_KARDEX[m.tipo]}</span>
                              <span className="font-semibold text-tinta">
                                {entrada !== null ? `+${entrada}` : `-${salida}`} → saldo {m.stockResultante}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-tinta/40">
                              {new Date(m.fechaHora).toLocaleString('es-PE')} · {m.motivo}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </section>
          )}
        </>

      {fotoAbierta && (
        <VisorFotoComprobante
          ruta={fotoAbierta.ruta}
          titulo={fotoAbierta.titulo}
          onCerrar={() => setFotoAbierta(null)}
        />
      )}
    </div>
  );
}
