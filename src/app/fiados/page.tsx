'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import type { Cliente, MetodoPagoSinFiado } from '@/core/tipos';
import type { EstadoPlan } from '@/core/plan';
import { construirMensajeDeuda } from '@/core/whatsapp';
import { construirEnlaceWhatsApp } from '@/infraestructura/whatsapp/enlace';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import { CLAVE_PREFIJO_PAIS, obtenerPrefijoPais } from '@/core/paises';
import { limpiarNumeroEscrito } from '@/core/texto';
import { hoyLocalSql } from '@/core/tiempo';

const METODOS: { valor: MetodoPagoSinFiado; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'yape', etiqueta: 'Yape' },
  { valor: 'plin', etiqueta: 'Plin' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
];

export default function PaginaFiados() {
  const { contenedor, cargando, error } = usarContenedor();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [simboloMoneda, setSimboloMoneda] = useState(obtenerSimboloMoneda(null));
  const [prefijoPais, setPrefijoPais] = useState(obtenerPrefijoPais(null));
  const [clienteAbierto, setClienteAbierto] = useState<number | null>(null);
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState<MetodoPagoSinFiado>('efectivo');
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  // Buscador (nombre, DNI o monto de deuda) + rango de fechas: para
  // cobrar fiados de días anteriores, no solo los de hoy. Sin rango
  // (desde/hasta vacíos), se comporta igual que antes — todos los
  // clientes con deuda activa hoy, sin importar cuándo se originó.
  const [busqueda, setBusqueda] = useState('');
  const [desde, setDesde] = useState(hoyLocalSql());
  const [hasta, setHasta] = useState(hoyLocalSql());
  const rangoInvalido = Boolean(desde) && Boolean(hasta) && desde > hasta;

  function recargar() {
    if (!contenedor || rangoInvalido) return;
    setClientes(contenedor.fiados.listarClientesConDeuda(desde || undefined, hasta || undefined));
  }

  useEffect(recargar, [contenedor, desde, hasta, rangoInvalido]);
  useEffect(() => {
    if (!contenedor) return;
    setEstadoPlan(contenedor.plan.obtenerEstado());
    setSimboloMoneda(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
    setPrefijoPais(obtenerPrefijoPais(contenedor.configuracion.obtenerValor(CLAVE_PREFIJO_PAIS)));
  }, [contenedor]);

const esPremium = estadoPlan?.tipo === 'premium';

  const clientesFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return clientes;
    return clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(texto) ||
        (c.documento ?? '').toLowerCase().includes(texto) ||
        c.saldoPendiente.toFixed(2).includes(texto),
    );
  }, [busqueda, clientes]);

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

  function enviarRecordatorioWhatsApp(cliente: Cliente) {
    if (!contenedor || !cliente.telefono) return;
    const deudas = contenedor.fiados.listarDeudasPendientesDetalladas(cliente.id);
    const mensaje = construirMensajeDeuda(cliente, deudas, simboloMoneda);
    const enlace = construirEnlaceWhatsApp(cliente.telefono, mensaje, prefijoPais);
    window.open(enlace, '_blank');
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
          <span className="font-semibold text-tinta">{formatearMonto(totalPorCobrar, simboloMoneda)}</span>
        </p>
      )}

      <div className="mt-4">
        <p className="text-xs font-semibold text-tinta/70">Rango de fechas (opcional)</p>
        <p className="mt-0.5 text-xs text-tinta/50">Filtra por cuándo se originó el fiado, para cobrar deudas de días anteriores.</p>
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
          {(desde || hasta) && (
            <button
              onClick={() => {
                setDesde('');
                setHasta('');
              }}
              className="mt-6 h-11 shrink-0 rounded-lg border border-linea px-3 text-xs font-semibold text-tinta/60"
            >
              Quitar
            </button>
          )}
        </div>
        {rangoInvalido && (
          <p className="mt-2 text-xs text-alerta">La fecha "desde" no puede ser posterior a "hasta".</p>
        )}
      </div>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por cliente, DNI o monto…"
        className="mt-3 h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
      />

      <main className="mt-4 flex-1">
        {cargando && <p className="text-sm text-tinta/60">Cargando…</p>}
        {error && <p className="text-sm text-alerta">{error.message}</p>}

        {!cargando && clientes.length === 0 && (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta/50">
            Nadie te debe por ahora.
          </p>
        )}

        {!cargando && clientes.length > 0 && clientesFiltrados.length === 0 && (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta/50">
            Ningún cliente coincide con "{busqueda}".
          </p>
        )}

        <ul className="divide-y divide-linea border-y border-linea">
          {clientesFiltrados.map((cliente) => (
            <li key={cliente.id} className="py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-tinta">{cliente.nombre}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-alerta">
                    {formatearMonto(cliente.saldoPendiente, simboloMoneda)}
                  </span>
                  <button
                    onClick={() => enviarRecordatorioWhatsApp(cliente)}
                    disabled={!cliente.telefono || !esPremium}
                    title={
                      !cliente.telefono
                        ? 'Este cliente no tiene teléfono registrado'
                        : !esPremium
                          ? 'Función Premium'
                          : undefined
                    }
                    className="text-xs font-semibold text-bodega-oscuro disabled:text-tinta/30"
                  >
                    WhatsApp
                  </button>
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
                    onChange={(e) => setMonto(limpiarNumeroEscrito(e.target.value))}
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
