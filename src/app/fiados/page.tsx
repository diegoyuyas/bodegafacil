'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import type { Cliente, MetodoPagoSinFiado } from '@/core/tipos';

const METODOS: { valor: MetodoPagoSinFiado; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'yape', etiqueta: 'Yape' },
  { valor: 'plin', etiqueta: 'Plin' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
];

function formatearSoles(monto: number): string {
  return `S/ ${monto.toFixed(2)}`;
}

export default function PaginaFiados() {
  const { contenedor, cargando, error } = usarContenedor();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteAbierto, setClienteAbierto] = useState<number | null>(null);
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState<MetodoPagoSinFiado>('efectivo');
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  function recargar() {
    if (contenedor) setClientes(contenedor.fiados.listarClientesConDeuda());
  }

  useEffect(recargar, [contenedor]);

  function abrirPago(cliente: Cliente) {
    setClienteAbierto(cliente.id);
    setMonto(cliente.saldoPendiente.toFixed(2));
    setMensajeError(null);
  }

  async function confirmarPago(clienteId: number) {
    if (!contenedor) return;
    setMensajeError(null);
    try {
      contenedor.fiados.registrarPago(clienteId, Number(monto), metodo);
      await contenedor.persistir();
      setClienteAbierto(null);
      recargar();
    } catch (e) {
      setMensajeError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo registrar el pago.');
    }
  }

  const totalPorCobrar = clientes.reduce((suma, c) => suma + c.saldoPendiente, 0);

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-xl text-tinta/60" aria-label="Volver a inicio">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Fiados</h1>
      </header>

      {clientes.length > 0 && (
        <p className="mt-4 text-sm text-tinta/60">
          Total por cobrar:{' '}
          <span className="font-semibold text-tinta">{formatearSoles(totalPorCobrar)}</span>
        </p>
      )}

      <main className="mt-4 flex-1">
        {cargando && <p className="text-sm text-tinta/60">Cargando…</p>}
        {error && <p className="text-sm text-alerta">{error.message}</p>}

        {!cargando && clientes.length === 0 && (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta/50">
            Nadie te debe por ahora.
          </p>
        )}

        <ul className="divide-y divide-linea border-y border-linea">
          {clientes.map((cliente) => (
            <li key={cliente.id} className="py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-tinta">{cliente.nombre}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-alerta">
                    {formatearSoles(cliente.saldoPendiente)}
                  </span>
                  <button
                    onClick={() =>
                      clienteAbierto === cliente.id ? setClienteAbierto(null) : abrirPago(cliente)
                    }
                    className="text-xs font-semibold text-bodega-oscuro"
                  >
                    {clienteAbierto === cliente.id ? 'Cerrar' : 'Registrar pago'}
                  </button>
                </div>
              </div>

              {clienteAbierto === cliente.id && (
                <div className="mt-3 space-y-3 rounded-xl border border-linea p-3">
                  <input
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    inputMode="decimal"
                    placeholder="Monto"
                    className="h-10 w-full rounded-lg border border-linea px-3 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    {METODOS.map((m) => (
                      <button
                        key={m.valor}
                        onClick={() => setMetodo(m.valor)}
                        className={`h-8 rounded-full border px-3 text-xs font-medium ${
                          metodo === m.valor
                            ? 'border-bodega bg-bodega text-white'
                            : 'border-linea text-tinta/70'
                        }`}
                      >
                        {m.etiqueta}
                      </button>
                    ))}
                  </div>
                  {mensajeError && <p className="text-xs text-alerta">{mensajeError}</p>}
                  <button
                    onClick={() => confirmarPago(cliente.id)}
                    disabled={!monto || Number(monto) <= 0}
                    className="h-10 w-full rounded-lg bg-bodega text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Confirmar pago
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
