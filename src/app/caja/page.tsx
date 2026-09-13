'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import type { MetodoPagoSinFiado, MovimientoCaja } from '@/core/tipos';

const METODOS: { valor: MetodoPagoSinFiado; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'yape', etiqueta: 'Yape' },
  { valor: 'plin', etiqueta: 'Plin' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
];

function formatearSoles(monto: number): string {
  return `S/ ${monto.toFixed(2)}`;
}

export default function PaginaCaja() {
  const { contenedor, cargando, error } = usarContenedor();
  const [saldo, setSaldo] = useState(0);
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState<'ingreso' | 'egreso' | null>(null);
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [metodo, setMetodo] = useState<MetodoPagoSinFiado>('efectivo');

  function recargar() {
    if (!contenedor) return;
    setSaldo(contenedor.caja.obtenerSaldoActual());
    setMovimientos(contenedor.caja.listarMovimientosDeHoy());
  }

  useEffect(recargar, [contenedor]);

  async function confirmarMovimiento() {
    if (!contenedor || !mostrarFormulario || !monto || !concepto.trim()) return;
    if (mostrarFormulario === 'ingreso') {
      contenedor.caja.registrarIngreso(Number(monto), concepto.trim(), metodo);
    } else {
      contenedor.caja.registrarEgreso(Number(monto), concepto.trim(), metodo);
    }
    await contenedor.persistir();
    setMonto('');
    setConcepto('');
    setMostrarFormulario(null);
    recargar();
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Caja</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta/60">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      <section className="mt-6">
        <p className="text-sm text-tinta/60">Saldo actual</p>
        <p className="text-4xl font-extrabold text-tinta">{formatearSoles(saldo)}</p>
      </section>

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => setMostrarFormulario(mostrarFormulario === 'ingreso' ? null : 'ingreso')}
          className="h-10 flex-1 rounded-full border border-bodega text-sm font-semibold text-bodega-oscuro"
        >
          + Ingreso
        </button>
        <button
          onClick={() => setMostrarFormulario(mostrarFormulario === 'egreso' ? null : 'egreso')}
          className="h-10 flex-1 rounded-full border border-alerta text-sm font-semibold text-alerta"
        >
          − Egreso
        </button>
      </div>

      {mostrarFormulario && (
        <section className="mt-4 space-y-3 rounded-xl border border-linea p-4">
          <input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder={mostrarFormulario === 'ingreso' ? 'Ej: Venta no registrada' : 'Ej: Compra de bolsas'}
            className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
          />
          <input
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="decimal"
            placeholder="Monto"
            className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            {METODOS.map((m) => (
              <button
                key={m.valor}
                onClick={() => setMetodo(m.valor)}
                className={`h-8 rounded-full border px-3 text-xs font-medium ${
                  metodo === m.valor ? 'border-bodega bg-bodega text-white' : 'border-linea text-tinta/70'
                }`}
              >
                {m.etiqueta}
              </button>
            ))}
          </div>
          <button
            onClick={confirmarMovimiento}
            disabled={!monto || Number(monto) <= 0 || !concepto.trim()}
            className="h-11 w-full rounded-lg bg-bodega text-sm font-semibold text-white disabled:opacity-40"
          >
            Registrar {mostrarFormulario}
          </button>
        </section>
      )}

      <section className="mt-6 flex-1">
        <p className="text-sm text-tinta/60">Movimientos de hoy</p>
        {movimientos.length === 0 ? (
          <p className="mt-3 border-y border-linea py-6 text-center text-sm text-tinta/50">
            Todavía no hay movimientos hoy.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-linea border-y border-linea">
            {movimientos.map((mov) => (
              <li key={mov.id} className="flex items-center justify-between py-3 text-sm">
                <span className="text-tinta/80">{mov.concepto}</span>
                <span className={`font-semibold ${mov.tipo === 'ingreso' ? 'text-bodega-oscuro' : 'text-alerta'}`}>
                  {mov.tipo === 'ingreso' ? '+' : '−'} {formatearSoles(mov.monto)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
