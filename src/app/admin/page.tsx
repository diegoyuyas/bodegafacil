'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import {
  DIAS_PREMIUM_MAXIMO,
  DIAS_PREMIUM_MINIMO,
  DURACIONES_PREMIUM_DIAS,
  LIMITE_VENTAS_PLAN_GRATIS,
} from '@/core/plan';
import type { DuracionPremiumDias, EstadoPlan } from '@/core/plan';
import { ErrorDeNegocio } from '@/core/reglas-negocio';

/**
 * Panel de administrador — no aparece en ningún menú. Se llega tocando
 * 5 veces el título en Inicio. Protegido por un PIN cuyo hash (nunca
 * el PIN en sí) se guarda en configuracion_app.
 */
export default function PaginaAdmin() {
  const { contenedor, cargando, error } = usarContenedor();

  const [tienePin, setTienePin] = useState<boolean | null>(null);
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [pinIngresado, setPinIngresado] = useState('');
  const [pinNuevo, setPinNuevo] = useState('');
  const [pinConfirmar, setPinConfirmar] = useState('');
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [ventasUsadas, setVentasUsadas] = useState(0);
  const [diasPersonalizados, setDiasPersonalizados] = useState('');
  const [mensajeErrorPlan, setMensajeErrorPlan] = useState<string | null>(null);

  // Cambiar PIN (una vez desbloqueado)
  const [mostrarCambiarPin, setMostrarCambiarPin] = useState(false);
  const [pinActualParaCambio, setPinActualParaCambio] = useState('');
  const [pinNuevoParaCambio, setPinNuevoParaCambio] = useState('');
  const [mensajeCambioPin, setMensajeCambioPin] = useState<string | null>(null);

  function recargarEstado() {
    if (!contenedor) return;
    setEstadoPlan(contenedor.plan.obtenerEstado());
    setVentasUsadas(contenedor.ventas.contarTotalHistorico());
    setTienePin(contenedor.plan.tienePinConfigurado());
  }

  useEffect(recargarEstado, [contenedor]);

  async function crearPin() {
    if (!contenedor) return;
    setMensajeError(null);
    if (pinNuevo.length < 4) {
      setMensajeError('Usa un PIN de al menos 4 caracteres.');
      return;
    }
    if (pinNuevo !== pinConfirmar) {
      setMensajeError('Los dos PIN no coinciden.');
      return;
    }
    await contenedor.plan.configurarPin(pinNuevo);
    await contenedor.persistir();
    setDesbloqueado(true);
    setTienePin(true);
  }

  async function ingresarPin() {
    if (!contenedor) return;
    setMensajeError(null);
    const correcto = await contenedor.plan.verificarPin(pinIngresado);
    if (!correcto) {
      setMensajeError('PIN incorrecto.');
      return;
    }
    setDesbloqueado(true);
    setPinIngresado('');
  }

  async function activarPremium(dias: DuracionPremiumDias) {
    if (!contenedor) return;
    contenedor.plan.activarPremium(dias);
    await contenedor.persistir();
    recargarEstado();
  }

  async function activarPremiumPersonalizado() {
    if (!contenedor) return;
    setMensajeErrorPlan(null);
    const dias = Number(diasPersonalizados);
    if (!Number.isInteger(dias) || dias < DIAS_PREMIUM_MINIMO || dias > DIAS_PREMIUM_MAXIMO) {
      setMensajeErrorPlan(`Ingresa un número entero entre ${DIAS_PREMIUM_MINIMO} y ${DIAS_PREMIUM_MAXIMO}.`);
      return;
    }
    try {
      contenedor.plan.activarPremium(dias);
      await contenedor.persistir();
      setDiasPersonalizados('');
      recargarEstado();
    } catch (e) {
      setMensajeErrorPlan(e instanceof ErrorDeNegocio ? e.message : 'No se pudo activar Premium.');
    }
  }

  async function desactivarPremium() {
    if (!contenedor) return;
    contenedor.plan.desactivarPremium();
    await contenedor.persistir();
    recargarEstado();
  }

  async function cambiarPin() {
    if (!contenedor) return;
    setMensajeCambioPin(null);
    if (pinNuevoParaCambio.length < 4) {
      setMensajeCambioPin('Usa un PIN de al menos 4 caracteres.');
      return;
    }
    const ok = await contenedor.plan.cambiarPin(pinActualParaCambio, pinNuevoParaCambio);
    if (!ok) {
      setMensajeCambioPin('El PIN actual no es correcto.');
      return;
    }
    await contenedor.persistir();
    setMensajeCambioPin('PIN actualizado.');
    setPinActualParaCambio('');
    setPinNuevoParaCambio('');
    setMostrarCambiarPin(false);
  }

  if (cargando || tienePin === null) {
    return <p className="p-5 text-sm text-tinta/60">Cargando…</p>;
  }
  if (error) {
    return <p className="p-5 text-sm text-alerta">{error.message}</p>;
  }

  // --- Primera vez: crear el PIN ---
  if (!tienePin) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-app flex-col justify-center px-5">
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Configurar administrador</h1>
        <p className="mt-1 text-sm text-tinta/60">
          Este PIN es tuyo. Úsalo en cada tienda para entrar a este panel.
        </p>
        <input
          type="password"
          inputMode="numeric"
          value={pinNuevo}
          onChange={(e) => setPinNuevo(e.target.value)}
          placeholder="Nuevo PIN"
          className="mt-4 h-12 w-full rounded-xl border border-linea px-4 text-base"
        />
        <input
          type="password"
          inputMode="numeric"
          value={pinConfirmar}
          onChange={(e) => setPinConfirmar(e.target.value)}
          placeholder="Confirma el PIN"
          className="mt-3 h-12 w-full rounded-xl border border-linea px-4 text-base"
        />
        {mensajeError && <p className="mt-2 text-sm text-alerta">{mensajeError}</p>}
        <button
          onClick={crearPin}
          className="mt-4 h-12 w-full rounded-xl bg-bodega text-sm font-semibold text-white"
        >
          Guardar PIN
        </button>
        <Link href="/" className="mt-4 text-center text-sm text-tinta/50">
          Volver a Inicio
        </Link>
      </div>
    );
  }

  // --- PIN configurado pero aún no ingresado ---
  if (!desbloqueado) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-app flex-col justify-center px-5">
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Panel de administrador</h1>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pinIngresado}
          onChange={(e) => setPinIngresado(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ingresarPin()}
          placeholder="PIN"
          className="mt-4 h-12 w-full rounded-xl border border-linea px-4 text-base"
        />
        {mensajeError && <p className="mt-2 text-sm text-alerta">{mensajeError}</p>}
        <button
          onClick={ingresarPin}
          className="mt-4 h-12 w-full rounded-xl bg-bodega text-sm font-semibold text-white"
        >
          Entrar
        </button>
        <Link href="/" className="mt-4 text-center text-sm text-tinta/50">
          Volver a Inicio
        </Link>
      </div>
    );
  }

  // --- Panel desbloqueado ---
  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-10 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-xl text-tinta/60" aria-label="Volver a inicio">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Panel de administrador</h1>
      </header>

      <section className="mt-6 rounded-xl border border-linea p-4">
        <p className="text-sm text-tinta/60">Estado actual</p>
        {estadoPlan?.tipo === 'premium' ? (
          <p className="mt-1 text-lg font-semibold text-bodega-oscuro">
            Premium — vence el {estadoPlan.venceEn} ({estadoPlan.diasRestantes}{' '}
            {estadoPlan.diasRestantes === 1 ? 'día' : 'días'})
          </p>
        ) : (
          <p className="mt-1 text-lg font-semibold text-tinta">
            Gratis — {ventasUsadas}/{LIMITE_VENTAS_PLAN_GRATIS} pedidos usados
          </p>
        )}
      </section>

      <section className="mt-6">
        <p className="text-sm text-tinta/60">Activar Premium por</p>
        <div className="mt-2 flex gap-2">
          {DURACIONES_PREMIUM_DIAS.map((dias) => (
            <button
              key={dias}
              onClick={() => activarPremium(dias)}
              className="h-11 flex-1 rounded-xl border border-bodega text-sm font-semibold text-bodega-oscuro"
            >
              {dias} días
            </button>
          ))}
        </div>

        <p className="mt-4 text-xs text-tinta/50">
          O un número de días a tu elección ({DIAS_PREMIUM_MINIMO} a {DIAS_PREMIUM_MAXIMO})
        </p>
        <div className="mt-2 flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={DIAS_PREMIUM_MINIMO}
            max={DIAS_PREMIUM_MAXIMO}
            value={diasPersonalizados}
            onChange={(e) => setDiasPersonalizados(e.target.value)}
            placeholder="Ej: 15"
            className="h-11 flex-1 rounded-xl border border-linea px-3 text-sm"
          />
          <button
            onClick={activarPremiumPersonalizado}
            disabled={diasPersonalizados.trim() === ''}
            className="h-11 rounded-xl border border-bodega px-4 text-sm font-semibold text-bodega-oscuro disabled:opacity-40"
          >
            Activar
          </button>
        </div>
        {mensajeErrorPlan && <p className="mt-2 text-sm text-alerta">{mensajeErrorPlan}</p>}
      </section>

      {estadoPlan?.tipo === 'premium' && (
        <button
          onClick={desactivarPremium}
          className="mt-4 h-11 rounded-xl border border-alerta text-sm font-semibold text-alerta"
        >
          Volver a modo Gratis
        </button>
      )}

      <section className="mt-8">
        <button
          onClick={() => setMostrarCambiarPin((v) => !v)}
          className="text-sm font-semibold text-tinta/70"
        >
          {mostrarCambiarPin ? 'Cancelar' : 'Cambiar mi PIN'}
        </button>

        {mostrarCambiarPin && (
          <div className="mt-3 space-y-3 rounded-xl border border-linea p-4">
            <input
              type="password"
              value={pinActualParaCambio}
              onChange={(e) => setPinActualParaCambio(e.target.value)}
              placeholder="PIN actual"
              className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
            />
            <input
              type="password"
              value={pinNuevoParaCambio}
              onChange={(e) => setPinNuevoParaCambio(e.target.value)}
              placeholder="PIN nuevo"
              className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
            />
            {mensajeCambioPin && <p className="text-sm text-alerta">{mensajeCambioPin}</p>}
            <button
              onClick={cambiarPin}
              className="h-11 w-full rounded-lg bg-bodega text-sm font-semibold text-white"
            >
              Guardar nuevo PIN
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
