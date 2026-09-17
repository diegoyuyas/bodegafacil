'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import { limpiarNumeroEscrito } from '@/core/texto';
import type { MetodoPagoSinFiado, MovimientoCaja } from '@/core/tipos';

const METODOS: { valor: MetodoPagoSinFiado; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'yape', etiqueta: 'Yape' },
  { valor: 'plin', etiqueta: 'Plin' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
];

const VISTAS = [
  { valor: 'ingreso', etiqueta: 'Ingresos' },
  { valor: 'egreso', etiqueta: 'Egresos' },
  { valor: 'todo', etiqueta: 'Ver todo' },
] as const;

type Vista = (typeof VISTAS)[number]['valor'];

export default function PaginaCaja() {
  const { contenedor, cargando, error } = usarContenedor();
  const [simboloMoneda, setSimboloMoneda] = useState(obtenerSimboloMoneda(null));

  useEffect(() => {
    if (!contenedor) return;
    setSimboloMoneda(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
  }, [contenedor]);
  const [saldo, setSaldo] = useState(0);
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([]);
  const [vista, setVista] = useState<Vista>('todo');
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

  const movimientosVisibles = useMemo(
    () => (vista === 'todo' ? movimientos : movimientos.filter((m) => m.tipo === vista)),
    [movimientos, vista],
  );

  const totalVisible = useMemo(() => {
    if (vista === 'ingreso') {
      return movimientosVisibles.reduce((suma, m) => suma + m.monto, 0);
    }
    if (vista === 'egreso') {
      return movimientosVisibles.reduce((suma, m) => suma + m.monto, 0);
    }
    // "Ver todo": el neto de hoy (ingresos - egresos), que es cuánto
    // cambió la caja en el día.
    return movimientosVisibles.reduce(
      (suma, m) => suma + (m.tipo === 'ingreso' ? m.monto : -m.monto),
      0,
    );
  }, [movimientosVisibles, vista]);

  const etiquetaTotal =
    vista === 'ingreso' ? 'Total de ingresos' : vista === 'egreso' ? 'Total de egresos' : 'Neto de hoy';

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
        <p className="text-4xl font-extrabold text-tinta">{formatearMonto(saldo, simboloMoneda)}</p>
      </section>

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => setMostrarFormulario(mostrarFormulario === 'ingreso' ? null : 'ingreso')}
          className={`h-10 flex-1 rounded-full border text-sm font-semibold ${
            mostrarFormulario === 'ingreso'
              ? 'border-bodega bg-bodega text-white'
              : 'border-bodega text-bodega-oscuro'
          }`}
        >
          + Ingreso
        </button>
        <button
          onClick={() => setMostrarFormulario(mostrarFormulario === 'egreso' ? null : 'egreso')}
          className={`h-10 flex-1 rounded-full border text-sm font-semibold ${
            mostrarFormulario === 'egreso' ? 'border-alerta bg-alerta text-white' : 'border-alerta text-alerta'
          }`}
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
            onChange={(e) => setMonto(limpiarNumeroEscrito(e.target.value))}
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

      {/* 3 vistas: Ingresos / Egresos / Ver todo, cada una con su propio total */}
      <div className="mt-6 flex gap-2">
        {VISTAS.map((v) => (
          <button
            key={v.valor}
            onClick={() => setVista(v.valor)}
            className={`h-9 flex-1 rounded-full border text-sm font-medium ${
              vista === v.valor ? 'border-bodega bg-bodega text-white' : 'border-linea text-tinta/70'
            }`}
          >
            {v.etiqueta}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl bg-bodega-claro/40 px-4 py-3">
        <span className="text-sm text-tinta/70">{etiquetaTotal}</span>
        <span className="text-base font-extrabold text-tinta">{formatearMonto(totalVisible, simboloMoneda)}</span>
      </div>

      <section className="mt-4 flex-1">
        {movimientosVisibles.length === 0 ? (
          <p className="mt-3 border-y border-linea py-6 text-center text-sm text-tinta/50">
            No hay movimientos {vista !== 'todo' ? `de ${vista === 'ingreso' ? 'ingresos' : 'egresos'} ` : ''}
            hoy.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-linea border-y border-linea">
            {movimientosVisibles.map((mov) => (
              <li key={mov.id} className="flex items-center justify-between py-3 text-sm">
                <span className="text-tinta/80">{mov.concepto}</span>
                <span className={`font-semibold ${mov.tipo === 'ingreso' ? 'text-bodega-oscuro' : 'text-alerta'}`}>
                  {mov.tipo === 'ingreso' ? '+' : '−'} {formatearMonto(mov.monto, simboloMoneda)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
