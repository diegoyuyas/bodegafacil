'use client';

/**
 * Vende Fácil — Más > Compras > Modificar
 * ------------------------------------------------------------
 * Misma idea que "Nueva compra" pero precargada con una compra ya
 * registrada. Es una ruta ESTÁTICA con el id por query string
 * (/compras/editar?id=5), no una ruta dinámica [id] — la app se
 * compila con `output: 'export'` para el APK (sin servidor), así que
 * un segmento [id] no podría resolverse en el dispositivo para un id
 * que no existía en tiempo de build.
 */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import { mayusculasAlEscribir } from '@/core/texto';
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

export default function PaginaEditarCompra() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-app px-5 pt-6 text-sm text-tinta/60">Cargando…</div>
      }
    >
      <ContenidoEditarCompra />
    </Suspense>
  );
}

function ContenidoEditarCompra() {
  const router = useRouter();
  const parametros = useSearchParams();
  const compraId = Number(parametros.get('id'));

  const { contenedor, cargando, error } = usarContenedor();
  const [simboloMoneda, setSimboloMoneda] = useState(obtenerSimboloMoneda(null));
  const [cargandoCompra, setCargandoCompra] = useState(true);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [texto, setTexto] = useState('');
  const [carrito, setCarrito] = useState<LineaCarritoCompra[]>([]);
  const [metodoPago, setMetodoPago] = useState<MetodoPagoSinFiado>('efectivo');

  const [busquedaProveedor, setBusquedaProveedor] = useState('');
  const [proveedoresEncontrados, setProveedoresEncontrados] = useState<Proveedor[]>([]);
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState<Proveedor | null>(null);
  const [proveedorNombreLibre, setProveedorNombreLibre] = useState('');

  const [comprobante, setComprobante] = useState('');

  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!contenedor) return;
    setSimboloMoneda(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
    setProductos(contenedor.productos.listarActivos());
  }, [contenedor]);

  // Precarga la compra a modificar.
  useEffect(() => {
    if (!contenedor || !compraId) return;
    setMensajeError(null);
    try {
      const { compra, lineas } = contenedor.compras.obtenerParaEditar(compraId);
      if (compra.estado === 'anulada') {
        setMensajeError(`La compra C-${compraId} está anulada y no se puede modificar.`);
        setCargandoCompra(false);
        return;
      }
      setCarrito(
        lineas.map((l) => ({
          productoId: l.productoId,
          nombre: l.nombreProducto,
          cantidad: l.cantidad,
          costoUnitario: l.costoUnitario,
        })),
      );
      setMetodoPago(compra.metodoPago ?? 'efectivo');
      setComprobante(compra.comprobante ?? '');
      setProveedorNombreLibre(compra.proveedorId ? '' : compra.proveedorNombreLibre ?? '');
      if (compra.proveedorId) {
        setProveedorSeleccionado(contenedor.proveedores.obtenerPorId(compra.proveedorId));
      }
    } catch (e) {
      setMensajeError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo cargar la compra.');
    } finally {
      setCargandoCompra(false);
    }
  }, [contenedor, compraId]);

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

  async function guardarCambios() {
    if (!contenedor || carrito.length === 0 || !compraId) return;
    setMensajeError(null);
    setGuardando(true);
    try {
      contenedor.compras.modificarCompra(compraId, {
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
      router.push('/compras');
    } catch (e) {
      setMensajeError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar el cambio.');
    } finally {
      setGuardando(false);
    }
  }

  if (!compraId) {
    return (
      <div className="mx-auto max-w-app px-5 pt-6 text-sm text-alerta">
        No se indicó qué compra modificar.{' '}
        <Link href="/compras" className="underline">
          Volver a Compras
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-[calc(7rem+var(--area-segura-abajo))] pt-6">
      <header className="flex items-center gap-3">
        <Link href="/compras" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Modificar compra C-{compraId}</h1>
      </header>

      {(cargando || cargandoCompra) && <p className="mt-4 text-sm text-tinta/60">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      {!cargandoCompra && (
        <>
          <div className="relative mt-5">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar producto para agregar…"
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

          <section className="mt-6">
            {carrito.length === 0 ? (
              <p className="border-y border-linea py-6 text-center text-sm text-tinta/50">
                Agrega al menos un producto
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
                        {formatearMonto(linea.cantidad * linea.costoUnitario, simboloMoneda)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

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
                  onChange={(e) => setProveedorNombreLibre(mayusculasAlEscribir(e.target.value))}
                  autoCapitalize="characters"
                  placeholder="O escribe cualquier nombre de proveedor (no se guarda)"
                  className="mt-2 h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
                />
              </>
            )}
          </section>

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
            <div className="fixed inset-x-0 bottom-0 mx-auto max-w-app border-t border-linea bg-papel px-5 pt-4 pb-[calc(1rem+var(--area-segura-abajo))]">
              <button
                onClick={guardarCambios}
                disabled={guardando}
                className="flex h-14 w-full items-center justify-center rounded-full bg-bodega text-base font-semibold text-white active:bg-bodega-oscuro disabled:opacity-60"
              >
                {guardando ? 'Guardando…' : `Guardar cambios — ${formatearMonto(total, simboloMoneda)}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
