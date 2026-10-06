'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { usarSolicitudPin } from '@/hooks/usar-solicitud-pin';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import type { HistorialProductoItem, Producto } from '@/core/tipos';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import { limpiarNumeroEscrito, mayusculasAlEscribir } from '@/core/texto';
import { formatearFechaHora } from '@/core/tiempo';
import { SelectorEstado, filtrarPorEstado, type FiltroEstado } from '@/components/selector-estado';

const ETIQUETAS_CAMPO_HISTORIAL: Record<HistorialProductoItem['campo'], string> = {
  nombre: 'Nombre',
  precio_venta: 'Precio de venta',
  costo: 'Costo',
  stock: 'Stock',
  stock_minimo: 'Stock mínimo',
};

export default function PaginaProductos() {
  const { contenedor, cargando, error } = usarContenedor();
  const { pedirPin, modalPin } = usarSolicitudPin(contenedor);
  const [simboloMoneda, setSimboloMoneda] = useState(obtenerSimboloMoneda(null));

  useEffect(() => {
    if (!contenedor) return;
    setSimboloMoneda(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
  }, [contenedor]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('activos');

  const [nombre, setNombre] = useState('');
  const [precioVenta, setPrecioVenta] = useState('');
  const [costo, setCosto] = useState('');
  const [stockActual, setStockActual] = useState('');
  const [stockMinimo, setStockMinimo] = useState('');
  const [controlaStock, setControlaStock] = useState(true);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nombreEdit, setNombreEdit] = useState('');
  const [precioVentaEdit, setPrecioVentaEdit] = useState('');
  const [costoEdit, setCostoEdit] = useState('');
  const [stockMinimoEdit, setStockMinimoEdit] = useState('');
  const [controlaStockEdit, setControlaStockEdit] = useState(true);
  const [activoEdit, setActivoEdit] = useState(true);
  const [mensajeErrorEdit, setMensajeErrorEdit] = useState<string | null>(null);

  // Ajuste manual de stock (conteo físico, merma, corrección) — no pasa
  // por una compra. Se registra en movimiento_inventario con trazabilidad.
  const [ajustandoId, setAjustandoId] = useState<number | null>(null);
  const [tipoAjuste, setTipoAjuste] = useState<'sumar' | 'restar'>('sumar');
  const [cantidadAjuste, setCantidadAjuste] = useState('');
  const [motivoAjuste, setMotivoAjuste] = useState('');
  const [mensajeErrorAjuste, setMensajeErrorAjuste] = useState<string | null>(null);

  // Bitácora de cambios manuales (ver producto.repositorio.ts): se pide
  // bajo demanda, solo para el producto que se tiene abierto.
  const [bitacoraId, setBitacoraId] = useState<number | null>(null);
  const [historial, setHistorial] = useState<HistorialProductoItem[]>([]);

  function recargar() {
    if (contenedor) setProductos(contenedor.productos.listarTodos());
  }

  useEffect(recargar, [contenedor]);

  async function guardarProducto() {
    if (!contenedor) return;
    setMensajeError(null);
    const precioNum = Number(precioVenta);
    const costoNum = Number(costo);
    // Costo en 0 no se avisa (puede ser un producto sin costo registrado
    // a propósito); solo se pregunta cuando el costo queda MÁS ALTO que
    // el precio de venta, porque eso casi siempre es un error de tipeo.
    if (costoNum > 0 && costoNum > precioNum) {
      const confirmar = window.confirm(
        `¿Está seguro de registrar este costo: ${formatearMonto(costoNum, simboloMoneda)} mayor al precio de venta ${formatearMonto(precioNum, simboloMoneda)}?`,
      );
      if (!confirmar) return;
    }
    try {
      contenedor.productos.crear({
        nombre: nombre.trim(),
        precioVenta: Number(precioVenta),
        costo: Number(costo),
        stockActual: Number(stockActual || 0),
        stockMinimo: Number(stockMinimo || 0),
        controlaStock,
        unidadMedida: 'unidad',
      });
      await contenedor.persistir();
      setNombre('');
      setPrecioVenta('');
      setCosto('');
      setStockActual('');
      setStockMinimo('');
      setControlaStock(true);
      setMostrarFormulario(false);
      recargar();
    } catch (e) {
      setMensajeError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar el producto.');
    }
  }

  function abrirEdicion(producto: Producto) {
    setMostrarFormulario(false);
    setAjustandoId(null);
    setBitacoraId(null);
    setEditandoId(producto.id);
    setNombreEdit(producto.nombre);
    setPrecioVentaEdit(String(producto.precioVenta));
    setCostoEdit(String(producto.costo));
    setStockMinimoEdit(String(producto.stockMinimo));
    setControlaStockEdit(producto.controlaStock);
    setActivoEdit(producto.activo);
    setMensajeErrorEdit(null);
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setMensajeErrorEdit(null);
  }

  function abrirAjuste(producto: Producto) {
    setMostrarFormulario(false);
    setEditandoId(null);
    setBitacoraId(null);
    setAjustandoId(producto.id);
    setTipoAjuste('sumar');
    setCantidadAjuste('');
    setMotivoAjuste('');
    setMensajeErrorAjuste(null);
  }

  function cancelarAjuste() {
    setAjustandoId(null);
    setMensajeErrorAjuste(null);
  }

  function alternarBitacora(producto: Producto) {
    if (bitacoraId === producto.id) {
      setBitacoraId(null);
      return;
    }
    setMostrarFormulario(false);
    setEditandoId(null);
    setAjustandoId(null);
    setBitacoraId(producto.id);
    setHistorial(contenedor ? contenedor.productos.listarHistorial(producto.id) : []);
  }

  function formatearValorCampo(campo: HistorialProductoItem['campo'], valor: string | null): string {
    if (valor === null) return '—';
    if (campo === 'precio_venta' || campo === 'costo') return formatearMonto(Number(valor), simboloMoneda);
    return valor;
  }

  const formularioAjusteValido = Number(cantidadAjuste) > 0 && motivoAjuste.trim().length > 0;

  async function confirmarAjuste() {
    if (!contenedor || ajustandoId === null) return;
    setMensajeErrorAjuste(null);
    if (!(await pedirPin('modificar', 'ajustar el stock'))) return;
    try {
      const delta = tipoAjuste === 'sumar' ? Number(cantidadAjuste) : -Number(cantidadAjuste);
      contenedor.productos.ajustarStock(ajustandoId, delta, motivoAjuste.trim());
      await contenedor.persistir();
      setAjustandoId(null);
      recargar();
    } catch (e) {
      setMensajeErrorAjuste(e instanceof ErrorDeNegocio ? e.message : 'No se pudo ajustar el stock.');
    }
  }

  const productosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const base = filtrarPorEstado(productos, filtroEstado);
    if (!texto) return base;
    return base.filter((p) => {
      if (p.nombre.toLowerCase().includes(texto)) return true;
      if (p.precioVenta.toFixed(2).includes(texto)) return true;
      if (String(p.precioVenta).includes(texto)) return true;
      return false;
    });
  }, [productos, busqueda, filtroEstado]);

  const formularioValido =
    nombre.trim().length > 0 && Number(precioVenta) >= 0 && Number(costo) >= 0;

  const formularioEditValido =
    nombreEdit.trim().length > 0 && Number(precioVentaEdit) >= 0 && Number(costoEdit) >= 0;

  async function guardarEdicion() {
    if (!contenedor || editandoId === null) return;
    setMensajeErrorEdit(null);
    const precioNum = Number(precioVentaEdit);
    const costoNum = Number(costoEdit);
    if (costoNum > 0 && costoNum > precioNum) {
      const confirmar = window.confirm(
        `¿Está seguro de registrar este costo: ${formatearMonto(costoNum, simboloMoneda)} mayor al precio de venta ${formatearMonto(precioNum, simboloMoneda)}?`,
      );
      if (!confirmar) return;
    }
    if (!(await pedirPin('modificar', 'guardar los cambios del producto'))) return;
    try {
      const producto = contenedor.productos.obtenerPorId(editandoId);
      contenedor.productos.actualizar(editandoId, {
        nombre: nombreEdit.trim(),
        categoriaId: producto.categoriaId,
        codigo: producto.codigo,
        precioVenta: Number(precioVentaEdit),
        costo: Number(costoEdit),
        stockMinimo: Number(stockMinimoEdit || 0),
        controlaStock: controlaStockEdit,
        unidadMedida: producto.unidadMedida,
        activo: activoEdit,
      });
      await contenedor.persistir();
      setEditandoId(null);
      recargar();
    } catch (e) {
      setMensajeErrorEdit(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar el producto.');
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      {modalPin}
      <header className="flex items-center gap-3">
        <Link href="/" className="text-xl text-tinta/60" aria-label="Volver a inicio">
          ←
        </Link>
        <h1 className="flex-1 text-lg font-extrabold text-bodega-oscuro">Productos</h1>
        <button
          onClick={() => {
            setEditandoId(null);
            setMostrarFormulario((v) => !v);
          }}
          className="text-sm font-semibold text-bodega-oscuro"
        >
          {mostrarFormulario ? 'Cancelar' : '+ Agregar'}
        </button>
      </header>

      {mostrarFormulario && (
        <section className="mt-4 space-y-3 rounded-xl border border-linea p-4">
          <input
            value={nombre}
            onChange={(e) => setNombre(mayusculasAlEscribir(e.target.value))}
            autoCapitalize="characters"
            placeholder="Nombre del producto"
            className="uppercase placeholder:normal-case h-11 w-full rounded-lg border border-linea px-3 text-sm"
          />
          <div className="flex gap-3">
            <input
              value={precioVenta}
              onChange={(e) => setPrecioVenta(limpiarNumeroEscrito(e.target.value))}
              inputMode="decimal"
              placeholder="Precio de venta"
              className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
            />
            <input
              value={costo}
              onChange={(e) => setCosto(limpiarNumeroEscrito(e.target.value))}
              inputMode="decimal"
              placeholder="Costo"
              className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-tinta">
            <input
              type="checkbox"
              checked={controlaStock}
              onChange={(e) => {
                const marcado = e.target.checked;
                setControlaStock(marcado);
                if (!marcado) {
                  setStockActual('0');
                  setStockMinimo('0');
                }
              }}
              className="h-4 w-4 rounded border-linea"
            />
            Controla stock
          </label>
          <div className="flex gap-3">
            <input
              value={controlaStock ? stockActual : '0'}
              onChange={(e) => setStockActual(limpiarNumeroEscrito(e.target.value))}
              disabled={!controlaStock}
              inputMode="numeric"
              placeholder="Stock inicial"
              className="h-11 w-full rounded-lg border border-linea px-3 text-sm disabled:bg-papel disabled:text-tinta/40"
            />
            <input
              value={controlaStock ? stockMinimo : '0'}
              onChange={(e) => setStockMinimo(limpiarNumeroEscrito(e.target.value))}
              disabled={!controlaStock}
              inputMode="numeric"
              placeholder="Stock mínimo"
              className="h-11 w-full rounded-lg border border-linea px-3 text-sm disabled:bg-papel disabled:text-tinta/40"
            />
          </div>
          {mensajeError && <p className="text-sm text-alerta">{mensajeError}</p>}
          <button
            onClick={guardarProducto}
            disabled={!formularioValido}
            className="h-11 w-full rounded-lg bg-bodega text-sm font-semibold text-white disabled:opacity-40"
          >
            Guardar producto
          </button>
        </section>
      )}

      {productos.length > 0 && (
        <div className="mt-4 flex gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o precio…"
            className="h-11 min-w-0 flex-1 rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
          />
          <SelectorEstado valor={filtroEstado} onCambiar={setFiltroEstado} />
        </div>
      )}

      <main className="mt-6 flex-1">
        {cargando && <p className="text-sm text-tinta/60">Cargando…</p>}
        {error && <p className="text-sm text-alerta">{error.message}</p>}

        {!cargando && productos.length === 0 && (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta/50">
            Todavía no tienes productos. Agrega el primero arriba.
          </p>
        )}

        {!cargando && productos.length > 0 && productosFiltrados.length === 0 && (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta/50">
            {busqueda.trim()
              ? `Ningún producto coincide con "${busqueda}".`
              : `No hay productos ${filtroEstado === 'inactivos' ? 'inactivos' : 'activos'}.`}
          </p>
        )}

        <ul className="divide-y divide-linea border-y border-linea">
          {productosFiltrados.map((producto) => {
            const stockBajo = producto.controlaStock && producto.stockActual <= producto.stockMinimo;
            return (
              <li key={producto.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-tinta">
                      {producto.nombre}
                      {!producto.activo && (
                        <span className="ml-2 rounded-full bg-alerta/10 px-2 py-0.5 text-xs font-semibold text-alerta">
                          Inactivo
                        </span>
                      )}
                    </p>
                    {producto.controlaStock ? (
                      <p className={`text-xs ${stockBajo ? 'text-alerta' : 'text-tinta/50'}`}>
                        Stock: {producto.stockActual} {stockBajo && '· bajo'}
                      </p>
                    ) : (
                      <p className="text-xs text-tinta/40">No controla stock</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold text-tinta">
                      {formatearMonto(producto.precioVenta, simboloMoneda)}
                    </span>
                    {producto.controlaStock && (
                      <button
                        onClick={() =>
                          ajustandoId === producto.id ? cancelarAjuste() : abrirAjuste(producto)
                        }
                        className="text-sm font-semibold text-tinta/70"
                      >
                        {ajustandoId === producto.id ? 'Cancelar' : 'Ajustar'}
                      </button>
                    )}
                    <button
                      onClick={() =>
                        editandoId === producto.id ? cancelarEdicion() : abrirEdicion(producto)
                      }
                      className="text-sm font-semibold text-bodega-oscuro"
                    >
                      {editandoId === producto.id ? 'Cancelar' : 'Editar'}
                    </button>
                    <button
                      onClick={() => alternarBitacora(producto)}
                      className="text-sm font-semibold text-tinta/70"
                    >
                      {bitacoraId === producto.id ? 'Cerrar' : 'Bitácora'}
                    </button>
                  </div>
                </div>

                {bitacoraId === producto.id && (
                  <div className="mt-3 space-y-2 rounded-xl border border-linea p-4">
                    <p className="text-xs text-tinta/50">
                      Cambios manuales a este producto (nombre, precio, costo, stock y stock
                      mínimo) — no incluye los movimientos normales de una venta o una compra.
                    </p>
                    {historial.length === 0 ? (
                      <p className="text-sm text-tinta/50">Sin cambios registrados todavía.</p>
                    ) : (
                      <ul className="divide-y divide-linea">
                        {historial.map((item, indice) => (
                          <li key={indice} className="py-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-tinta">
                                {ETIQUETAS_CAMPO_HISTORIAL[item.campo]}
                              </span>
                              <span className="text-xs text-tinta/40">{formatearFechaHora(item.fecha)}</span>
                            </div>
                            <p className="text-tinta/70">
                              {item.valorAnterior === null ? (
                                <>Se registró en {formatearValorCampo(item.campo, item.valorNuevo)}</>
                              ) : (
                                <>
                                  Cambió de {formatearValorCampo(item.campo, item.valorAnterior)} a{' '}
                                  {formatearValorCampo(item.campo, item.valorNuevo)}
                                </>
                              )}
                            </p>
                            {item.motivo && <p className="text-xs text-tinta/50">Motivo: {item.motivo}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {ajustandoId === producto.id && (
                  <div className="mt-3 space-y-3 rounded-xl border border-linea p-4">
                    <p className="text-xs text-tinta/50">
                      Stock actual: <span className="font-semibold text-tinta">{producto.stockActual}</span>{' '}
                      {producto.unidadMedida}. Usa esto para conteos físicos o mermas — no para
                      reponer stock de una compra (eso va en Compras).
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTipoAjuste('sumar')}
                        className={`h-9 flex-1 rounded-full border text-sm font-medium ${
                          tipoAjuste === 'sumar'
                            ? 'border-bodega bg-bodega text-white'
                            : 'border-linea text-tinta/70'
                        }`}
                      >
                        + Sumar
                      </button>
                      <button
                        onClick={() => setTipoAjuste('restar')}
                        className={`h-9 flex-1 rounded-full border text-sm font-medium ${
                          tipoAjuste === 'restar'
                            ? 'border-alerta bg-alerta text-white'
                            : 'border-linea text-tinta/70'
                        }`}
                      >
                        − Restar
                      </button>
                    </div>
                    <input
                      value={cantidadAjuste}
                      onChange={(e) => setCantidadAjuste(limpiarNumeroEscrito(e.target.value))}
                      inputMode="decimal"
                      placeholder="Cantidad"
                      className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
                    />
                    <input
                      value={motivoAjuste}
                      onChange={(e) => setMotivoAjuste(e.target.value)}
                      placeholder="Motivo (ej: conteo físico, producto vencido)"
                      className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
                    />
                    {mensajeErrorAjuste && <p className="text-sm text-alerta">{mensajeErrorAjuste}</p>}
                    <button
                      onClick={confirmarAjuste}
                      disabled={!formularioAjusteValido}
                      className="h-11 w-full rounded-lg bg-bodega text-sm font-semibold text-white disabled:opacity-40"
                    >
                      Confirmar ajuste
                    </button>
                  </div>
                )}

                {editandoId === producto.id && (
                  <div className="mt-3 space-y-3 rounded-xl border border-linea p-4">
                    <input
                      value={nombreEdit}
                      onChange={(e) => setNombreEdit(mayusculasAlEscribir(e.target.value))}
                      autoCapitalize="characters"
                      placeholder="Nombre del producto"
                      className="uppercase placeholder:normal-case h-11 w-full rounded-lg border border-linea px-3 text-sm"
                    />
                    <div className="flex gap-3">
                      <input
                        value={precioVentaEdit}
                        onChange={(e) => setPrecioVentaEdit(limpiarNumeroEscrito(e.target.value))}
                        inputMode="decimal"
                        placeholder="Precio de venta"
                        className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
                      />
                      <input
                        value={costoEdit}
                        onChange={(e) => setCostoEdit(limpiarNumeroEscrito(e.target.value))}
                        inputMode="decimal"
                        placeholder="Costo"
                        className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-tinta">
                      <input
                        type="checkbox"
                        checked={controlaStockEdit}
                        onChange={(e) => {
                          const marcado = e.target.checked;
                          setControlaStockEdit(marcado);
                          if (!marcado) setStockMinimoEdit('0');
                        }}
                        className="h-4 w-4 rounded border-linea"
                      />
                      Controla stock
                    </label>
                    <input
                      value={controlaStockEdit ? stockMinimoEdit : '0'}
                      onChange={(e) => setStockMinimoEdit(limpiarNumeroEscrito(e.target.value))}
                      disabled={!controlaStockEdit}
                      inputMode="numeric"
                      placeholder="Stock mínimo"
                      className="h-11 w-full rounded-lg border border-linea px-3 text-sm disabled:bg-papel disabled:text-tinta/40"
                    />
                    <div>
                      <label className="mb-1 block text-xs text-tinta/50">Estado</label>
                      <select
                        value={activoEdit ? 'activo' : 'inactivo'}
                        onChange={(e) => setActivoEdit(e.target.value === 'activo')}
                        className="h-11 w-full rounded-lg border border-linea bg-white px-3 text-sm"
                      >
                        <option value="activo">Activo</option>
                        <option value="inactivo">Inactivo (no aparece para vender)</option>
                      </select>
                    </div>
                    {mensajeErrorEdit && <p className="text-sm text-alerta">{mensajeErrorEdit}</p>}
                    <button
                      onClick={guardarEdicion}
                      disabled={!formularioEditValido}
                      className="h-11 w-full rounded-lg bg-bodega text-sm font-semibold text-white disabled:opacity-40"
                    >
                      Guardar cambios
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
