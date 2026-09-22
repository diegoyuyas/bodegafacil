'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import type { VentaReimpresionItem } from '@/core/tipos';
import type { EstadoPlan } from '@/core/plan';
import { hoyLocalSql } from '@/core/tiempo';
import { obtenerSimboloMoneda, CLAVE_MONEDA, formatearMonto } from '@/core/moneda';
import { CLAVE_IMPRESORA_ACTIVA, IMPRESION_BLUETOOTH_DISPONIBLE } from '@/core/impresora';
import { imprimirComprobanteDeVenta } from '@/infraestructura/impresora-bluetooth/imprimir-venta';
import { Proximamente } from '@/components/proximamente';

const MENSAJE_IMPRESORA_NO_CONFIGURADA = 'No está correctamente configurada la impresora.';

const ETIQUETAS_METODO_PAGO: Record<string, string> = {
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  tarjeta: 'Tarjeta',
  fiado: 'Fiado',
};

function haceUnaSemana(): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - 7);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

export default function PaginaReimprimirDocumentos() {
  const { contenedor, cargando, error } = usarContenedor();

  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [impresoraActiva, setImpresoraActiva] = useState(false);

  const [desde, setDesde] = useState(haceUnaSemana());
  const [hasta, setHasta] = useState(hoyLocalSql());
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<VentaReimpresionItem[]>([]);
  const [simboloMoneda, setSimboloMoneda] = useState('S/');

  const [imprimiendoId, setImprimiendoId] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [mensajeEsError, setMensajeEsError] = useState(false);

  const rangoInvalido = Boolean(desde) && Boolean(hasta) && desde > hasta;

  useEffect(() => {
    if (!contenedor) return;
    setEstadoPlan(contenedor.plan.obtenerEstado());
    setImpresoraActiva(contenedor.configuracion.obtenerValor(CLAVE_IMPRESORA_ACTIVA) === '1');
    setSimboloMoneda(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
  }, [contenedor]);

  useEffect(() => {
    if (!contenedor || rangoInvalido || !desde || !hasta) {
      setResultados([]);
      return;
    }
    setResultados(contenedor.ventas.buscarParaReimprimir(desde, hasta, texto));
  }, [contenedor, desde, hasta, texto, rangoInvalido]);

  async function reimprimir(ventaId: number) {
    if (!contenedor) return;
    setMensaje(null);
    setImprimiendoId(ventaId);
    try {
      await imprimirComprobanteDeVenta(contenedor, ventaId);
      setMensajeEsError(false);
      setMensaje(`V-${ventaId} enviado a la impresora.`);
    } catch {
      setMensajeEsError(true);
      setMensaje(MENSAJE_IMPRESORA_NO_CONFIGURADA);
    } finally {
      setImprimiendoId(null);
    }
  }

  const esPremium = estadoPlan?.tipo === 'premium';

  if (!IMPRESION_BLUETOOTH_DISPONIBLE) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
        <header className="flex items-center gap-3">
          <Link href="/mas" className="text-xl text-tinta/60" aria-label="Volver">
            ←
          </Link>
          <h1 className="text-lg font-extrabold text-bodega-oscuro">Reimprimir documentos</h1>
        </header>
        <Proximamente
          titulo="Próximamente"
          detalle="Reimprimir depende de la impresión en ticketera Bluetooth, que todavía está en preparación."
        />
      </div>
    );
  }

  if (estadoPlan && (!esPremium || !impresoraActiva)) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
        <header className="flex items-center gap-3">
          <Link href="/mas" className="text-xl text-tinta/60" aria-label="Volver">
            ←
          </Link>
          <h1 className="text-lg font-extrabold text-bodega-oscuro">Reimprimir documentos</h1>
        </header>
        <section className="mt-6 rounded-xl border border-linea p-5 text-center">
          <p className="text-sm font-semibold text-tinta">
            {!esPremium ? 'Reimprimir documentos es una función Premium' : 'Falta activar la impresora'}
          </p>
          <p className="mt-2 text-xs text-tinta/60">
            {!esPremium
              ? 'Actívala desde el panel de administrador.'
              : 'Ve a Más > Configuración > Configuración de Impresión y activa "Activar impresión Bluetooth".'}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Reimprimir documentos</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta/60">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      <div className="mt-4">
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

      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar por V-1, cliente, DNI o monto…"
        className="mt-4 h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
      />

      {mensaje && (
        <p className={`mt-3 text-sm ${mensajeEsError ? 'text-alerta' : 'text-bodega-oscuro'}`}>{mensaje}</p>
      )}

      {resultados.length === 0 ? (
        <p className="mt-6 border-y border-linea py-8 text-center text-sm text-tinta/50">
          No hay ventas que coincidan.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-linea border-y border-linea">
          {resultados.map((venta) => (
            <li key={venta.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-tinta">
                  V-{venta.id} {venta.anulada && <span className="text-alerta">(Anulada)</span>}
                </p>
                <p className="truncate text-xs text-tinta/50">
                  {venta.clienteNombre ?? 'Cliente Eventual'}
                  {venta.clienteDocumento ? ` · ${venta.clienteDocumento}` : ''} ·{' '}
                  {ETIQUETAS_METODO_PAGO[venta.metodoPago] ?? venta.metodoPago}
                </p>
                <p className="text-xs text-tinta/40">{venta.fechaHora}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold text-tinta">
                  {formatearMonto(venta.total, simboloMoneda)}
                </span>
                <button
                  onClick={() => reimprimir(venta.id)}
                  disabled={imprimiendoId === venta.id}
                  aria-label={`Reimprimir V-${venta.id}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-bodega text-bodega-oscuro disabled:opacity-40"
                >
                  {imprimiendoId === venta.id ? '…' : '🖨️'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
