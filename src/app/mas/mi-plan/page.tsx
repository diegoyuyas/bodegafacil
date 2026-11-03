'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { LIMITE_VENTAS_PLAN_GRATIS, type EstadoPlan } from '@/core/plan';
import { ErrorDeNegocio } from '@/core/reglas-negocio';

export default function PaginaMiPlan() {
  const { contenedor, cargando, error } = usarContenedor();

  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [totalHistorico, setTotalHistorico] = useState(0);

  const [idDispositivo, setIdDispositivo] = useState('');
  const [codigoActivacion, setCodigoActivacion] = useState('');
  const [activandoCodigo, setActivandoCodigo] = useState(false);
  const [mensajeCodigo, setMensajeCodigo] = useState<string | null>(null);
  const [mensajeCodigoEsError, setMensajeCodigoEsError] = useState(false);
  const [idCopiado, setIdCopiado] = useState(false);

  useEffect(() => {
    if (!contenedor) return;
    setEstadoPlan(contenedor.plan.obtenerEstado());
    setTotalHistorico(contenedor.ventas.contarTotalHistorico());

    const id = contenedor.plan.obtenerIdDispositivoTexto();
    setIdDispositivo(id);
    // La primera vez que se genera el ID del dispositivo hay que
    // guardarlo ya mismo: si se cierra la app antes de la próxima
    // venta (que persiste sola), el ID se perdería y cambiaría cada
    // vez, invalidando los códigos ya pedidos para este dispositivo.
    contenedor.persistir().catch(() => {});
  }, [contenedor]);

  async function activarPremiumConCodigo() {
    if (!contenedor) return;
    setMensajeCodigo(null);
    setMensajeCodigoEsError(false);
    if (codigoActivacion.trim() === '') return;
    setActivandoCodigo(true);
    try {
      await contenedor.plan.activarConCodigo(codigoActivacion);
      await contenedor.persistir();
      setCodigoActivacion('');
      setMensajeCodigo('¡Código aceptado! Premium activado.');
      setEstadoPlan(contenedor.plan.obtenerEstado());
    } catch (e) {
      setMensajeCodigoEsError(true);
      setMensajeCodigo(e instanceof ErrorDeNegocio ? e.message : 'No se pudo activar con ese código.');
    } finally {
      setActivandoCodigo(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas" className="text-xl text-tinta-suave" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Mi plan</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta-suave">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      {estadoPlan && estadoPlan.tipo === 'premium' && (
        <div className="mt-6 rounded-xl border border-bodega bg-bodega-claro/40 px-4 py-3 text-sm text-tinta">
          <span className="font-semibold text-bodega-oscuro">Plan Premium</span> — te quedan{' '}
          <span className="font-semibold">
            {estadoPlan.diasRestantes} {estadoPlan.diasRestantes === 1 ? 'día' : 'días'}
          </span>
          .
        </div>
      )}

      {estadoPlan && estadoPlan.tipo === 'gratis' && (
        <div
          className={`mt-6 rounded-xl border px-4 py-3 text-sm text-tinta ${
            totalHistorico >= LIMITE_VENTAS_PLAN_GRATIS
              ? 'border-alerta bg-alerta/10'
              : totalHistorico >= LIMITE_VENTAS_PLAN_GRATIS - 20
                ? 'border-acento bg-acento/10'
                : 'border-linea'
          }`}
        >
          {totalHistorico >= LIMITE_VENTAS_PLAN_GRATIS ? (
            <>
              Llegaste al límite de <span className="font-semibold">{LIMITE_VENTAS_PLAN_GRATIS} pedidos</span> del Plan
              Gratis. Contacta a soporte para activar Premium.
            </>
          ) : (
            <>
              Plan Gratis:{' '}
              <span className="font-semibold">
                {totalHistorico}/{LIMITE_VENTAS_PLAN_GRATIS}
              </span>{' '}
              pedidos usados.
            </>
          )}
        </div>
      )}

      <section className="mt-6 rounded-xl border border-linea p-4">
        <p className="text-sm font-semibold text-tinta">Activar Premium con un código</p>
        <p className="mt-1 text-xs text-tinta-suave">
          1. Manda este ID a quien te da soporte por WhatsApp. 2. Pega acá el código que te
          responda.
        </p>

        <div className="mt-3">
          <p className="text-xs text-tinta-suave">ID de este dispositivo</p>
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-linea bg-papel px-3 py-2">
            <code className="flex-1 select-all break-all text-sm text-tinta">{idDispositivo}</code>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard?.writeText(idDispositivo);
                setIdCopiado(true);
                setTimeout(() => setIdCopiado(false), 2000);
              }}
              className="shrink-0 text-xs font-semibold text-bodega-oscuro"
            >
              {idCopiado ? 'Código copiado' : 'Copiar'}
            </button>
          </div>
        </div>

        <div className="mt-3">
          <p className="text-xs text-tinta-suave">Código de activación</p>
          <textarea
            value={codigoActivacion}
            onChange={(e) => setCodigoActivacion(e.target.value)}
            placeholder="Pega aquí el código que te mandaron por WhatsApp"
            rows={3}
            className="mt-1 w-full rounded-lg border border-linea px-3 py-2 text-sm"
          />
          <button
            onClick={activarPremiumConCodigo}
            disabled={activandoCodigo || codigoActivacion.trim() === ''}
            className="mt-2 h-11 w-full rounded-xl bg-bodega text-sm font-semibold text-white disabled:opacity-40"
          >
            {activandoCodigo ? 'Verificando…' : 'Activar con este código'}
          </button>
          {mensajeCodigo && (
            <p className={`mt-2 text-sm ${mensajeCodigoEsError ? 'text-alerta' : 'text-bodega-oscuro'}`}>
              {mensajeCodigo}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
