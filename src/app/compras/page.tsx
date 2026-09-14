'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import type { LineaCompraEntrada } from '@/core/repositorios';
import type { MetodoPagoSinFiado, Producto, Proveedor } from '@/core/tipos';

interface LineaCarritoCompra extends LineaCompraEntrada {
  nombre: string;
}

const METODOS: { valor: MetodoPagoSinFiado; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'yape', etiqueta: 'Yape' },
  { valor: 'plin', etiqueta: 'Plin' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
];

function formatearSoles(monto: number): string {
  return `S/ ${monto.toFixed(2)}`;
}

export default function PaginaCompras() {
  const { contenedor, cargando, error } = usarContenedor();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [texto, setTexto] = useState('');
  const [carrito, setCarrito] = useState<LineaCarritoCompra[]>([]);
  const [metodoPago, setMetodoPago] = useState<MetodoPagoSinFiado>('efectivo');

  // Proveedor: buscar uno guardado (por RUC, nombre o celular) o
  // simplemente escribir un nombre al vuelo, sin guardarlo.
  const [busquedaProveedor, setBusquedaProveedor] = useState('');
  const [proveedoresEncontrados, setProveedoresEncontrados] = useState<Proveedor[]>([]);
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState<Proveedor | null>(null);
  const [proveedorNombreLibre, setProveedorNombreLibre] = useState('');

  const [comprobante, setComprobante] = useState('');

  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [totalGuardado, setTotalGuardado] = useState<number | null>(null);

  useEffect(() => {
    if (!contenedor) return;
    setProductos(contenedor.productos.listarActivos());
  }, [contenedor]);

  useEffect(() => {
    if (!contenedor || !busquedaProveedor.trim()) {
      setProveedoresEncontrados([]);
      return;
    }
    setProveedoresEncontrados(contenedor.proveedores.buscarPorTexto(busquedaProveedor));
  }, [contenedor, busquedaProveedor]);

  const resultadosBusqueda = useMemo(() => {
    if (!texto.trim()) return [];
    const textoNormalizado = texto.trim().toLowerCase();
    return productos.filter((p) => p.nombre.toLowerCase().includes(textoNormalizado)).slice(0, 8);
  }, [texto, productos]);

  const total = useMemo(
    () => carrito.reduce((suma, l) => suma + l.cantidad * l.costoUnitario, 0),
    [carrito],
  );

  function agregarProducto(producto: Producto) {
    setTexto('');
    setCarrito((actual) => {
      if (actual.some((l) => l.productoId === producto.id)) return actual;
      return [
        ...actual,
        { productoId: producto.id, nombre: producto.nombre, cantidad: 1, costoUnitario: producto.costo },
      ];
    });
  }

  function actualizarLinea(productoId: number, campo: 'cantidad' | 'costoUnitario', valor: number) {
    setCarrito((actual) =>
      actual.map((l) => (l.productoId === productoId ? { ...l, [campo]: Math.max(valor, 0) } : l)),
    );
  }

  function quitarLinea(productoId: number) {
    setCarrito((actual) => actual.filter((l) => l.productoId !== productoId));
  }

  function seleccionarProveedor(proveedor: Proveedor) {
    setProveedorSeleccionado(proveedor);
    setProveedorNombreLibre('');
    setBusquedaProveedor('');
    setProveedoresEncontrados([]);
  }

  async function confirmarCompra() {
    if (!contenedor || carrito.length === 0) return;
    setMensajeError(null);
    setGuardando(true);
    try {
      const compra = contenedor.compras.registrarCompra({
        proveedorId: proveedorSeleccionado?.id ?? null,
        proveedorNombreLibre: proveedorSeleccionado ? null : proveedorNombreLibre.trim() || null,
        comprobante: comprobante.trim() || null,
        metodoPago,
        lineas: carrito.map(({ productoId, cantidad, costoUnitario }) => ({
          productoId,
          cantidad,
          costoUnitario,
        })),
      });
      await contenedor.persistir();
      setTotalGuardado(compra.total);
      setCarrito([]);
      setProveedorSeleccionado(null);
      setProveedorNombreLibre('');
      setComprobante('');
      setProductos(contenedor.productos.listarActivos());
    } catch (e) {
      setMensajeError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar la compra.');
    } finally {
      setGuardando(false);
    }
  }

  if (totalGuardado !== null) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-app flex-col items-center justify-center gap-6 px-5 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bodega-claro text-3xl">
          ✓
        </div>
        <div>
          <p className="text-sm text-tinta/60">Compra registrada</p>
          <p className="text-4xl font-extrabold text-tinta">{formatearSoles(totalGuardado)}</p>
          <p className="mt-1 text-sm text-tinta/60">El stock ya quedó actualizado.</p>
        </div>
        <div className="flex w-full flex-col gap-3">
          <button
            onClick={() => setTotalGuardado(null)}
            className="h-14 rounded-full bg-bodega text-base font-semibold text-white active:bg-bodega-oscuro"
          >
            Registrar otra compra
          </button>
          <Link
            href="/mas"
            className="flex h-14 items-center justify-center rounded-full border border-linea text-base font-semibold text-tinta"
          >
            Volver
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-40 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Nueva compra</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta/60">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      {/* Buscador de productos existentes */}
      <div className="relative mt-5">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar producto para reponer…"
          className="h-12 w-full rounded-xl border border-linea bg-white px-4 text-base outline-none focus:border-bodega"
        />
        {resultadosBusqueda.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-linea bg-white shadow-sm">
            {resultadosBusqueda.map((producto) => (
              <li key={producto.id}>
                <button
                  onClick={() => agregarProducto(producto)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
                >
                  <span>{producto.nombre}</span>
                  <span className="text-tinta/60">Stock: {producto.stockActual}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-2 text-xs text-tinta/40">
        ¿Producto nuevo? Créalo primero en{' '}
        <Link href="/productos" className="underline">
          Productos
        </Link>
        .
      </p>

      {/* Carrito de compra */}
      <section className="mt-6">
        {carrito.length === 0 ? (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta/50">
            Busca los productos que estás reponiendo
          </p>
        ) : (
          <ul className="divide-y divide-linea border-y border-linea">
            {carrito.map((linea) => (
              <li key={linea.productoId} className="space-y-2 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-tinta">{linea.nombre}</span>
                  <button
                    onClick={() => quitarLinea(linea.productoId)}
                    className="text-tinta/40"
                    aria-label={`Quitar ${linea.nombre}`}
                  >
                    ✕
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex-1 text-xs text-tinta/50">
                    Cantidad
                    <input
                      type="number"
                      min={1}
                      value={linea.cantidad}
                      onChange={(e) =>
                        actualizarLinea(linea.productoId, 'cantidad', Number(e.target.value))
                      }
                      className="mt-1 h-10 w-full rounded-lg border border-linea px-3 text-sm"
                    />
                  </label>
                  <label className="flex-1 text-xs text-tinta/50">
                    Costo unitario
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={linea.costoUnitario}
                      onChange={(e) =>
                        actualizarLinea(linea.productoId, 'costoUnitario', Number(e.target.value))
                      }
                      className="mt-1 h-10 w-full rounded-lg border border-linea px-3 text-sm"
                    />
                  </label>
                  <span className="w-16 pt-4 text-right text-sm font-semibold">
                    {formatearSoles(linea.cantidad * linea.costoUnitario)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Proveedor: buscar uno guardado, o escribir cualquier nombre */}
      <section className="mt-6">
        <p className="text-sm text-tinta/60">Proveedor (opcional)</p>

        {proveedorSeleccionado ? (
          <div className="mt-2 flex items-center justify-between rounded-xl border border-linea bg-white px-4 py-3">
            <div>
              <p className="text-sm text-tinta">{proveedorSeleccionado.nombre}</p>
              <p className="text-xs text-tinta/50">
                {proveedorSeleccionado.ruc ? `RUC ${proveedorSeleccionado.ruc}` : 'Sin RUC'}
                {proveedorSeleccionado.telefono && ` · ${proveedorSeleccionado.telefono}`}
              </p>
            </div>
            <button
              onClick={() => setProveedorSeleccionado(null)}
              className="text-tinta/40"
              aria-label="Quitar proveedor"
            >
              ✕
            </button>
          </div>
        ) : (
          <>
            <div className="relative mt-2">
              <input
                value={busquedaProveedor}
                onChange={(e) => setBusquedaProveedor(e.target.value)}
                placeholder="Buscar por RUC, nombre o celular…"
                className="h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
              />
              {proveedoresEncontrados.length > 0 && (
                <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-linea bg-white shadow-sm">
                  {proveedoresEncontrados.map((proveedor) => (
                    <li key={proveedor.id}>
                      <button
                        onClick={() => seleccionarProveedor(proveedor)}
                        className="flex w-full flex-col items-start px-4 py-2 text-left text-sm"
                      >
                        <span>{proveedor.nombre}</span>
                        <span className="text-xs text-tinta/50">
                          {proveedor.ruc ? `RUC ${proveedor.ruc}` : 'Sin RUC'}
                          {proveedor.telefono && ` · ${proveedor.telefono}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <input
              value={proveedorNombreLibre}
              onChange={(e) => setProveedorNombreLibre(e.target.value)}
              placeholder="O escribe cualquier nombre de proveedor (no se guarda)"
              className="mt-2 h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
            />
            <p className="mt-2 text-xs text-tinta/40">
              ¿Vas a comprarle seguido? Guárdalo en{' '}
              <Link href="/mas/proveedores" className="underline">
                Más → Proveedores
              </Link>{' '}
              para poder buscarlo la próxima vez.
            </p>
          </>
        )}
      </section>

      {/* Comprobante (opcional) */}
      <section className="mt-6">
        <p className="text-sm text-tinta/60">Comprobante (opcional)</p>
        <input
          value={comprobante}
          onChange={(e) => setComprobante(e.target.value)}
          placeholder="Ej: F001-00000010"
          maxLength={15}
          className="mt-2 h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
        />
      </section>

      {/* Método de pago */}
      <section className="mt-6">
        <p className="text-sm text-tinta/60">Pagada con</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {METODOS.map((m) => (
            <button
              key={m.valor}
              onClick={() => setMetodoPago(m.valor)}
              className={`h-9 rounded-full border px-4 text-sm font-medium ${
                metodoPago === m.valor ? 'border-bodega bg-bodega text-white' : 'border-linea text-tinta/70'
              }`}
            >
              {m.etiqueta}
            </button>
          ))}
        </div>
      </section>

      {mensajeError && <p className="mt-4 text-sm text-alerta">{mensajeError}</p>}

      {carrito.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-app border-t border-linea bg-papel px-5 py-4">
          <button
            onClick={confirmarCompra}
            disabled={guardando}
            className="flex h-14 w-full items-center justify-center rounded-full bg-bodega text-base font-semibold text-white active:bg-bodega-oscuro disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : `Registrar compra — ${formatearSoles(total)}`}
          </button>
        </div>
      )}
    </div>
  );
}
