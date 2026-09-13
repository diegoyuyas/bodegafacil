'use client';

import Link from 'next/link';
import { useMemo, useState, useEffect, useRef } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { construirVenta, ErrorDeNegocio } from '@/core/reglas-negocio';
import type { Cliente, MetodoPago, Producto } from '@/core/tipos';

interface LineaCarrito {
  productoId: number;
  nombre: string;
  cantidad: number;
  precioVenta: number;
  stockDisponible: number;
}

const METODOS_PAGO: { valor: MetodoPago; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'yape', etiqueta: 'Yape' },
  { valor: 'plin', etiqueta: 'Plin' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
  { valor: 'fiado', etiqueta: 'Fiado' },
];

function formatearSoles(monto: number): string {
  return `S/ ${monto.toFixed(2)}`;
}

export default function PaginaNuevaVenta() {
  const { contenedor, cargando, error } = usarContenedor();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [texto, setTexto] = useState('');
  const inputBusquedaProductoRef = useRef<HTMLInputElement>(null);
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');

  // Cliente: opcional para cualquier método de pago, obligatorio si es fiado.
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [clientesEncontrados, setClientesEncontrados] = useState<Cliente[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);

  const [etapa, setEtapa] = useState<'armando' | 'revisando' | 'guardada'>('armando');
  const [totalGuardado, setTotalGuardado] = useState(0);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (contenedor) setProductos(contenedor.productos.listarActivos());
  }, [contenedor]);

  useEffect(() => {
    if (!contenedor || !busquedaCliente.trim()) {
      setClientesEncontrados([]);
      return;
    }
    setClientesEncontrados(contenedor.clientes.buscarPorTexto(busquedaCliente));
  }, [contenedor, busquedaCliente]);

  const resultadosBusqueda = useMemo(() => {
    if (!texto.trim()) return [];
    const textoNormalizado = texto.trim().toLowerCase();
    return productos
      .filter((p) => p.nombre.toLowerCase().includes(textoNormalizado))
      .slice(0, 8);
  }, [texto, productos]);

  const calculo = useMemo(() => {
    if (carrito.length === 0) return null;
    try {
      return construirVenta(
        carrito.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
        (id) => {
          const producto = productos.find((p) => p.id === id);
          if (!producto) throw new ErrorDeNegocio(`Producto ${id} ya no existe.`);
          return producto;
        },
      );
    } catch (e) {
      return e instanceof ErrorDeNegocio ? e.message : 'No se pudo calcular la venta.';
    }
  }, [carrito, productos]);

  const calculoValido = calculo && typeof calculo !== 'string' ? calculo : null;
  const errorCalculo = typeof calculo === 'string' ? calculo : null;

  function agregarProducto(producto: Producto) {
    setTexto('');
    setCarrito((actual) => {
      const existente = actual.find((l) => l.productoId === producto.id);
      if (existente) {
        if (existente.cantidad >= producto.stockActual) return actual;
        return actual.map((l) =>
          l.productoId === producto.id ? { ...l, cantidad: l.cantidad + 1 } : l,
        );
      }
      if (producto.stockActual <= 0) return actual;
      return [
        ...actual,
        {
          productoId: producto.id,
          nombre: producto.nombre,
          cantidad: 1,
          precioVenta: producto.precioVenta,
          stockDisponible: producto.stockActual,
        },
      ];
    });
    // Vuelve el foco al buscador para que quede claro que puede seguir
    // agregando productos sin tener que tocar la pantalla de nuevo.
    // El pequeño delay deja que React re-renderice el input (que se
    // vació arriba) antes de intentar enfocarlo.
    setTimeout(() => inputBusquedaProductoRef.current?.focus(), 0);
  }

  function cambiarCantidad(productoId: number, delta: number) {
    setCarrito((actual) =>
      actual
        .map((l) => {
          if (l.productoId !== productoId) return l;
          const nueva = l.cantidad + delta;
          return { ...l, cantidad: Math.min(nueva, l.stockDisponible) };
        })
        .filter((l) => l.cantidad > 0),
    );
  }

  function quitarProducto(productoId: number) {
    setCarrito((actual) => actual.filter((l) => l.productoId !== productoId));
  }

  function elegirMetodoPago(valor: MetodoPago) {
    setMetodoPago(valor);
    // Corrige el bug de que un cliente elegido para una venta al fiado
    // quedara "pegado" si luego se cambia a efectivo/yape/etc: al salir
    // de fiado, se limpia la selección para no arrastrarla.
    if (valor !== 'fiado') {
      setClienteSeleccionado(null);
      setBusquedaCliente('');
    }
  }

  function seleccionarCliente(cliente: Cliente) {
    setClienteSeleccionado(cliente);
    setBusquedaCliente('');
    setClientesEncontrados([]);
  }

  async function confirmarVenta() {
    if (!contenedor || !calculoValido) return;
    if (metodoPago === 'fiado' && !clienteSeleccionado) {
      setMensajeError('Elige un cliente para la venta al fiado.');
      return;
    }

    setGuardando(true);
    setMensajeError(null);
    try {
      const venta = contenedor.ventas.registrarVenta({
        lineas: carrito.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
        metodoPago,
        clienteId: clienteSeleccionado?.id ?? null,
      });
      await contenedor.persistir();
      setTotalGuardado(venta.total);
      setEtapa('guardada');
    } catch (e) {
      setMensajeError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar la venta.');
    } finally {
      setGuardando(false);
    }
  }

  function empezarNuevaVenta() {
    setCarrito([]);
    setClienteSeleccionado(null);
    setBusquedaCliente('');
    setMetodoPago('efectivo');
    setMensajeError(null);
    setEtapa('armando');
    if (contenedor) setProductos(contenedor.productos.listarActivos());
  }

  if (cargando) {
    return <p className="p-5 text-sm text-tinta/60">Cargando…</p>;
  }
  if (error) {
    return <p className="p-5 text-sm text-alerta">No se pudo abrir la base de datos: {error.message}</p>;
  }

  if (etapa === 'guardada') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-app flex-col items-center justify-center gap-6 px-5 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bodega-claro text-3xl">
          ✓
        </div>
        <div>
          <p className="text-sm text-tinta/60">Venta guardada</p>
          <p className="text-4xl font-extrabold text-tinta">{formatearSoles(totalGuardado)}</p>
        </div>
        <div className="flex w-full flex-col gap-3">
          <button
            onClick={empezarNuevaVenta}
            className="h-14 rounded-full bg-bodega text-base font-semibold text-white active:bg-bodega-oscuro"
          >
            Nueva venta
          </button>
          <Link
            href="/"
            className="flex h-14 items-center justify-center rounded-full border border-linea text-base font-semibold text-tinta"
          >
            Volver a inicio
          </Link>
        </div>
      </div>
    );
  }

  if (etapa === 'revisando' && calculoValido) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-8 pt-6">
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Confirmar venta</h1>

        <ul className="mt-6 divide-y divide-linea border-y border-linea">
          {carrito.map((linea) => (
            <li key={linea.productoId} className="flex items-center justify-between py-3 text-sm">
              <span className="text-tinta/80">
                {linea.cantidad} × {linea.nombre}
              </span>
              <span className="font-semibold text-tinta">
                {formatearSoles(linea.precioVenta * linea.cantidad)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-base font-semibold text-tinta">Total</span>
          <span className="text-2xl font-extrabold text-tinta">
            {formatearSoles(calculoValido.total)}
          </span>
        </div>

        <p className="mt-2 text-sm text-tinta/60">
          Pago: {METODOS_PAGO.find((m) => m.valor === metodoPago)?.etiqueta} ·{' '}
          {clienteSeleccionado ? clienteSeleccionado.nombre : 'Cliente eventual'}
        </p>

        {mensajeError && <p className="mt-3 text-sm text-alerta">{mensajeError}</p>}

        <div className="mt-auto flex flex-col gap-3 pt-8">
          <button
            onClick={confirmarVenta}
            disabled={guardando}
            className="h-14 rounded-full bg-bodega text-base font-semibold text-white active:bg-bodega-oscuro disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : 'Confirmar venta'}
          </button>
          <button
            onClick={() => setEtapa('armando')}
            className="h-12 text-sm font-semibold text-tinta/70"
          >
            Editar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-40 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-xl text-tinta/60" aria-label="Volver a inicio">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Nueva venta</h1>
      </header>

      {/* Buscador de productos */}
      <div className="relative mt-5">
        <input
          ref={inputBusquedaProductoRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar producto…"
          className="h-12 w-full rounded-xl border border-linea bg-white px-4 text-base outline-none focus:border-bodega"
        />
        {resultadosBusqueda.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-linea bg-white shadow-sm">
            {resultadosBusqueda.map((producto) => (
              <li key={producto.id}>
                <button
                  onClick={() => agregarProducto(producto)}
                  disabled={producto.stockActual <= 0}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm disabled:opacity-40"
                >
                  <span>{producto.nombre}</span>
                  <span className="text-tinta/60">
                    {producto.stockActual <= 0 ? 'Sin stock' : formatearSoles(producto.precioVenta)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Carrito */}
      <section className="mt-6">
        {carrito.length === 0 ? (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta/50">
            Busca un producto para empezar
          </p>
        ) : (
          <ul className="divide-y divide-linea border-y border-linea">
            {carrito.map((linea) => (
              <li key={linea.productoId} className="flex items-center gap-3 py-3">
                <div className="flex-1">
                  <p className="text-sm text-tinta">{linea.nombre}</p>
                  <p className="text-xs text-tinta/50">{formatearSoles(linea.precioVenta)} c/u</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => cambiarCantidad(linea.productoId, -1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-linea text-tinta"
                    aria-label="Quitar uno"
                  >
                    −
                  </button>
                  <span className="w-5 text-center text-sm font-semibold">{linea.cantidad}</span>
                  <button
                    onClick={() => cambiarCantidad(linea.productoId, 1)}
                    disabled={linea.cantidad >= linea.stockDisponible}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-linea text-tinta disabled:opacity-30"
                    aria-label="Agregar uno"
                  >
                    +
                  </button>
                </div>
                <span className="w-16 text-right text-sm font-semibold">
                  {formatearSoles(linea.precioVenta * linea.cantidad)}
                </span>
                <button
                  onClick={() => quitarProducto(linea.productoId)}
                  className="text-tinta/40"
                  aria-label={`Quitar ${linea.nombre}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {errorCalculo && <p className="mt-2 text-sm text-alerta">{errorCalculo}</p>}
      </section>

      {/* Método de pago */}
      <section className="mt-6">
        <p className="text-sm text-tinta/60">Método de pago</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {METODOS_PAGO.map((m) => (
            <button
              key={m.valor}
              onClick={() => elegirMetodoPago(m.valor)}
              className={`h-9 rounded-full border px-4 text-sm font-medium ${
                metodoPago === m.valor
                  ? 'border-bodega bg-bodega text-white'
                  : 'border-linea text-tinta/70'
              }`}
            >
              {m.etiqueta}
            </button>
          ))}
        </div>
      </section>

      {/* Cliente: opcional siempre, obligatorio solo si es fiado */}
      <section className="mt-4">
        <p className="text-sm text-tinta/60">
          Cliente {metodoPago === 'fiado' ? '(obligatorio para fiado)' : '(opcional)'}
        </p>

        {clienteSeleccionado ? (
          <div className="mt-2 flex items-center justify-between rounded-xl border border-linea bg-white px-4 py-3">
            <div>
              <p className="text-sm text-tinta">{clienteSeleccionado.nombre}</p>
              <p className="text-xs text-tinta/50">{clienteSeleccionado.documento}</p>
            </div>
            <button
              onClick={() => setClienteSeleccionado(null)}
              className="text-tinta/40"
              aria-label="Quitar cliente"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="relative mt-2">
            <input
              value={busquedaCliente}
              onChange={(e) => setBusquedaCliente(e.target.value)}
              placeholder="Buscar por nombre o documento…"
              className="h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
            />
            {clientesEncontrados.length > 0 && (
              <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-linea bg-white shadow-sm">
                {clientesEncontrados.map((cliente) => (
                  <li key={cliente.id}>
                    <button
                      onClick={() => seleccionarCliente(cliente)}
                      className="flex w-full flex-col items-start px-4 py-2 text-left text-sm"
                    >
                      <span>{cliente.nombre}</span>
                      <span className="text-xs text-tinta/50">{cliente.documento}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-tinta/40">
              Si no seleccionas a nadie, la venta queda como{' '}
              <span className="font-medium text-tinta/60">Cliente eventual</span>. ¿Cliente nuevo?
              Créalo en{' '}
              <Link href="/mas/clientes" className="underline">
                Más → Clientes
              </Link>
              .
            </p>
          </div>
        )}
      </section>

      {/* Acción principal */}
      {calculoValido && (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-app border-t border-linea bg-papel px-5 py-4">
          <button
            onClick={() => setEtapa('revisando')}
            className="flex h-14 w-full items-center justify-center rounded-full bg-bodega text-base font-semibold text-white active:bg-bodega-oscuro"
          >
            Revisar y cobrar {formatearSoles(calculoValido.total)}
          </button>
        </div>
      )}
    </div>
  );
}
