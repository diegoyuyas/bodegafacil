'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import type { Producto } from '@/core/tipos';
import { ErrorDeNegocio } from '@/core/reglas-negocio';

function formatearSoles(monto: number): string {
  return `S/ ${monto.toFixed(2)}`;
}

export default function PaginaProductos() {
  const { contenedor, cargando, error } = usarContenedor();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  const [nombre, setNombre] = useState('');
  const [precioVenta, setPrecioVenta] = useState('');
  const [costo, setCosto] = useState('');
  const [stockActual, setStockActual] = useState('');
  const [stockMinimo, setStockMinimo] = useState('');
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nombreEdit, setNombreEdit] = useState('');
  const [precioVentaEdit, setPrecioVentaEdit] = useState('');
  const [costoEdit, setCostoEdit] = useState('');
  const [stockMinimoEdit, setStockMinimoEdit] = useState('');
  const [activoEdit, setActivoEdit] = useState(true);
  const [mensajeErrorEdit, setMensajeErrorEdit] = useState<string | null>(null);

  // Ajuste manual de stock (conteo físico, merma, corrección) — no pasa
  // por una compra. Se registra en movimiento_inventario con trazabilidad.
  const [ajustandoId, setAjustandoId] = useState<number | null>(null);
  const [tipoAjuste, setTipoAjuste] = useState<'sumar' | 'restar'>('sumar');
  const [cantidadAjuste, setCantidadAjuste] = useState('');
  const [motivoAjuste, setMotivoAjuste] = useState('');
  const [mensajeErrorAjuste, setMensajeErrorAjuste] = useState<string | null>(null);

  function recargar() {
    if (contenedor) setProductos(contenedor.productos.listarTodos());
  }

  useEffect(recargar, [contenedor]);

  async function guardarProducto() {
    if (!contenedor) return;
    setMensajeError(null);
    try {
      contenedor.productos.crear({
        nombre: nombre.trim(),
        precioVenta: Number(precioVenta),
        costo: Number(costo),
        stockActual: Number(stockActual || 0),
        stockMinimo: Number(stockMinimo || 0),
        unidadMedida: 'unidad',
      });
      await contenedor.persistir();
      setNombre('');
      setPrecioVenta('');
      setCosto('');
      setStockActual('');
      setStockMinimo('');
      setMostrarFormulario(false);
      recargar();
    } catch (e) {
      setMensajeError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar el producto.');
    }
  }

  function abrirEdicion(producto: Producto) {
    setMostrarFormulario(false);
    setEditandoId(producto.id);
    setNombreEdit(producto.nombre);
    setPrecioVentaEdit(String(producto.precioVenta));
    setCostoEdit(String(producto.costo));
    setStockMinimoEdit(String(producto.stockMinimo));
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

  const formularioAjusteValido = Number(cantidadAjuste) > 0 && motivoAjuste.trim().length > 0;

  async function confirmarAjuste() {
    if (!contenedor || ajustandoId === null) return;
    setMensajeErrorAjuste(null);
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

  const formularioValido =
    nombre.trim().length > 0 && Number(precioVenta) >= 0 && Number(costo) >= 0;

  const formularioEditValido =
    nombreEdit.trim().length > 0 && Number(precioVentaEdit) >= 0 && Number(costoEdit) >= 0;

  async function guardarEdicion() {
    if (!contenedor || editandoId === null) return;
    setMensajeErrorEdit(null);
    try {
      const producto = contenedor.productos.obtenerPorId(editandoId);
      contenedor.productos.actualizar(editandoId, {
        nombre: nombreEdit.trim(),
        categoriaId: producto.categoriaId,
        codigo: producto.codigo,
        precioVenta: Number(precioVentaEdit),
        costo: Number(costoEdit),
        stockMinimo: Number(stockMinimoEdit || 0),
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
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre del producto"
            className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
          />
          <div className="flex gap-3">
            <input
              value={precioVenta}
              onChange={(e) => setPrecioVenta(e.target.value)}
              inputMode="decimal"
              placeholder="Precio de venta"
              className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
            />
            <input
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
              inputMode="decimal"
              placeholder="Costo"
              className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
            />
          </div>
          <div className="flex gap-3">
            <input
              value={stockActual}
              onChange={(e) => setStockActual(e.target.value)}
              inputMode="numeric"
              placeholder="Stock inicial"
              className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
            />
            <input
              value={stockMinimo}
              onChange={(e) => setStockMinimo(e.target.value)}
              inputMode="numeric"
              placeholder="Stock mínimo"
              className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
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

      <main className="mt-6 flex-1">
        {cargando && <p className="text-sm text-tinta/60">Cargando…</p>}
        {error && <p className="text-sm text-alerta">{error.message}</p>}

        {!cargando && productos.length === 0 && (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta/50">
            Todavía no tienes productos. Agrega el primero arriba.
          </p>
        )}

        <ul className="divide-y divide-linea border-y border-linea">
          {productos.map((producto) => {
            const stockBajo = producto.stockActual <= producto.stockMinimo;
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
                    <p className={`text-xs ${stockBajo ? 'text-alerta' : 'text-tinta/50'}`}>
                      Stock: {producto.stockActual} {stockBajo && '· bajo'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold text-tinta">
                      {formatearSoles(producto.precioVenta)}
                    </span>
                    <button
                      onClick={() =>
                        ajustandoId === producto.id ? cancelarAjuste() : abrirAjuste(producto)
                      }
                      className="text-sm font-semibold text-tinta/70"
                    >
                      {ajustandoId === producto.id ? 'Cancelar' : 'Ajustar'}
                    </button>
                    <button
                      onClick={() =>
                        editandoId === producto.id ? cancelarEdicion() : abrirEdicion(producto)
                      }
                      className="text-sm font-semibold text-bodega-oscuro"
                    >
                      {editandoId === producto.id ? 'Cancelar' : 'Editar'}
                    </button>
                  </div>
                </div>

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
                      onChange={(e) => setCantidadAjuste(e.target.value)}
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
                      onChange={(e) => setNombreEdit(e.target.value)}
                      placeholder="Nombre del producto"
                      className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
                    />
                    <div className="flex gap-3">
                      <input
                        value={precioVentaEdit}
                        onChange={(e) => setPrecioVentaEdit(e.target.value)}
                        inputMode="decimal"
                        placeholder="Precio de venta"
                        className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
                      />
                      <input
                        value={costoEdit}
                        onChange={(e) => setCostoEdit(e.target.value)}
                        inputMode="decimal"
                        placeholder="Costo"
                        className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
                      />
                    </div>
                    <input
                      value={stockMinimoEdit}
                      onChange={(e) => setStockMinimoEdit(e.target.value)}
                      inputMode="numeric"
                      placeholder="Stock mínimo"
                      className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
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
