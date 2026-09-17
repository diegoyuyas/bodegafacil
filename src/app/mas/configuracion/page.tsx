'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import {
  CLAVE_NOMBRE_TIENDA,
  CLAVE_NOTIFICAR_STOCK_BAJO,
  CLAVE_PRECIO_EDITABLE_VENTA,
  NOMBRE_TIENDA_PREDETERMINADO,
  estaActivado,
  obtenerNombreTienda,
  valorParaGuardar,
} from '@/core/configuracion';
import { CLAVE_MONEDA, MONEDAS_DISPONIBLES, obtenerMoneda } from '@/core/moneda';
import { CLAVE_PREFIJO_PAIS, PAISES_AMERICA, obtenerPrefijoPais } from '@/core/paises';
import type { EstadoPlan } from '@/core/plan';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import { solicitarPermisoNotificaciones } from '@/infraestructura/notificaciones/notificaciones-navegador';

/**
 * Interruptor ON/OFF con la misma identidad visual que el resto de
 * la app (verde toldo cuando está activo). No hay un componente
 * <Switch> compartido todavía en el proyecto, así que este botón se
 * arma con Tailwind puro, igual que el resto de las pantallas.
 */
function Interruptor({
  activado,
  onChange,
  disabled,
}: {
  activado: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activado}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        activado ? 'bg-bodega' : 'bg-linea'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-150 ${
          activado ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function PaginaConfiguracion() {
  const { contenedor, cargando, error } = usarContenedor();

  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [precioEditable, setPrecioEditable] = useState(false);
  const [notificarStockBajo, setNotificarStockBajo] = useState(false);
  const [mensajePermiso, setMensajePermiso] = useState<string | null>(null);

  const [nombreTienda, setNombreTienda] = useState('');
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [nombreGuardado, setNombreGuardado] = useState(false);

  const [codigoMoneda, setCodigoMoneda] = useState(obtenerMoneda(null).codigo);
  const [prefijoPais, setPrefijoPais] = useState(obtenerPrefijoPais(null));

  const [idDispositivo, setIdDispositivo] = useState('');
  const [codigoActivacion, setCodigoActivacion] = useState('');
  const [activandoCodigo, setActivandoCodigo] = useState(false);
  const [mensajeCodigo, setMensajeCodigo] = useState<string | null>(null);
  const [mensajeCodigoEsError, setMensajeCodigoEsError] = useState(false);

  useEffect(() => {
    if (!contenedor) return;
    setEstadoPlan(contenedor.plan.obtenerEstado());
    setPrecioEditable(estaActivado(contenedor.configuracion.obtenerValor(CLAVE_PRECIO_EDITABLE_VENTA)));
    setNotificarStockBajo(
      estaActivado(contenedor.configuracion.obtenerValor(CLAVE_NOTIFICAR_STOCK_BAJO)),
    );
    setNombreTienda(obtenerNombreTienda(contenedor.configuracion.obtenerValor(CLAVE_NOMBRE_TIENDA)));
    setCodigoMoneda(obtenerMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)).codigo);
    setPrefijoPais(obtenerPrefijoPais(contenedor.configuracion.obtenerValor(CLAVE_PREFIJO_PAIS)));

    const id = contenedor.plan.obtenerIdDispositivoTexto();
    setIdDispositivo(id);
    // La primera vez que se genera el ID del dispositivo hay que
    // guardarlo ya mismo: si se cierra la app antes de la próxima
    // venta (que persiste sola), el ID se perdería y cambiaría cada
    // vez, invalidando los códigos ya pedidos para este dispositivo.
    contenedor.persistir().catch(() => {});
  }, [contenedor]);

  const esPremium = estadoPlan?.tipo === 'premium';

  async function alternarPrecioEditable() {
    if (!contenedor) return;
    const nuevoValor = !precioEditable;
    setPrecioEditable(nuevoValor);
    contenedor.configuracion.establecerValor(CLAVE_PRECIO_EDITABLE_VENTA, valorParaGuardar(nuevoValor));
    await contenedor.persistir();
  }

  async function alternarNotificarStockBajo() {
    if (!contenedor || !esPremium) return;
    setMensajePermiso(null);

    const nuevoValor = !notificarStockBajo;

    // Al activarlo (no al desactivarlo) se pide permiso al navegador.
    // Si el bodeguero lo rechaza, no tiene sentido guardar el switch
    // en ON: no habría forma de mostrar nada.
    if (nuevoValor) {
      const permiso = await solicitarPermisoNotificaciones();
      if (permiso !== 'granted') {
        setMensajePermiso(
          'Activa los permisos de notificaciones de este navegador para poder avisarte.',
        );
        return;
      }
    }

    setNotificarStockBajo(nuevoValor);
    contenedor.configuracion.establecerValor(CLAVE_NOTIFICAR_STOCK_BAJO, valorParaGuardar(nuevoValor));
    await contenedor.persistir();
  }

  async function guardarNombreTienda() {
    if (!contenedor || !esPremium) return;
    setGuardandoNombre(true);
    setNombreGuardado(false);
    const limpio = nombreTienda.trim();
    if (limpio) {
      contenedor.configuracion.establecerValor(CLAVE_NOMBRE_TIENDA, limpio);
    } else {
      contenedor.configuracion.eliminarValor(CLAVE_NOMBRE_TIENDA);
    }
    await contenedor.persistir();
    setNombreTienda(limpio || NOMBRE_TIENDA_PREDETERMINADO);
    setGuardandoNombre(false);
    setNombreGuardado(true);
  }

  async function cambiarMoneda(nuevoCodigo: string) {
    if (!contenedor) return;
    setCodigoMoneda(nuevoCodigo);
    contenedor.configuracion.establecerValor(CLAVE_MONEDA, nuevoCodigo);
    await contenedor.persistir();
  }

  async function cambiarPrefijoPais(nuevoPrefijo: string) {
    if (!contenedor) return;
    setPrefijoPais(nuevoPrefijo);
    contenedor.configuracion.establecerValor(CLAVE_PREFIJO_PAIS, nuevoPrefijo);
    await contenedor.persistir();
  }

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
        <Link href="/mas" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Configuración</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta/60">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      <ul className="mt-6 divide-y divide-linea border-y border-linea">
        <li className="flex items-center justify-between gap-4 py-4">
          <div>
            <p className="text-sm font-semibold text-tinta">Precio editable al vender</p>
            <p className="mt-0.5 text-xs text-tinta/50">
              Permite cambiar el precio de un producto al momento de registrar la venta.
            </p>
          </div>
          <Interruptor activado={precioEditable} onChange={alternarPrecioEditable} disabled={!contenedor} />
        </li>

        <li className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-tinta">Notificación de stock bajo</p>
              <p className="mt-0.5 text-xs text-tinta/50">
                Avisa cuando algún producto llega a su stock mínimo.
              </p>
              {!esPremium && <p className="mt-1 text-xs font-semibold text-acento-oscuro">Función Premium</p>}
            </div>
            <Interruptor
              activado={notificarStockBajo}
              onChange={alternarNotificarStockBajo}
              disabled={!contenedor || !esPremium}
            />
          </div>
          {mensajePermiso && <p className="mt-2 text-xs text-alerta">{mensajePermiso}</p>}
        </li>
      </ul>

      <section className="mt-6">
        <p className="text-sm font-semibold text-tinta">Nombre de tienda</p>
        <p className="mt-0.5 text-xs text-tinta/50">
          Reemplaza &quot;{NOMBRE_TIENDA_PREDETERMINADO}&quot; por el nombre de tu negocio en Inicio.
        </p>
        {!esPremium && <p className="mt-1 text-xs font-semibold text-acento-oscuro">Función Premium</p>}

        <div className="mt-3 flex gap-2">
          <input
            value={nombreTienda}
            onChange={(e) => {
              setNombreTienda(e.target.value);
              setNombreGuardado(false);
            }}
            disabled={!contenedor || !esPremium}
            placeholder={NOMBRE_TIENDA_PREDETERMINADO}
            maxLength={40}
            className="h-11 flex-1 rounded-xl border border-linea px-3 text-sm disabled:opacity-40"
          />
          <button
            onClick={guardarNombreTienda}
            disabled={!contenedor || !esPremium || guardandoNombre}
            className="h-11 rounded-xl border border-bodega px-4 text-sm font-semibold text-bodega-oscuro disabled:opacity-40"
          >
            Guardar
          </button>
        </div>
        {nombreGuardado && <p className="mt-2 text-xs text-bodega-oscuro">Nombre guardado.</p>}
      </section>

      <section className="mt-6">
        <p className="text-sm font-semibold text-tinta">Tipo de moneda</p>
        <p className="mt-0.5 text-xs text-tinta/50">
          Cambia el símbolo que se muestra en toda la app (ventas, caja, reportes, fiados...).
        </p>
        <select
          value={codigoMoneda}
          onChange={(e) => cambiarMoneda(e.target.value)}
          disabled={!contenedor}
          className="mt-3 h-11 w-full rounded-xl border border-linea bg-white px-3 text-sm disabled:opacity-40"
        >
          {MONEDAS_DISPONIBLES.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.etiqueta}
            </option>
          ))}
        </select>
      </section>

      <section className="mt-6">
        <p className="text-sm font-semibold text-tinta">Prefijo país</p>
        <p className="mt-0.5 text-xs text-tinta/50">
          El código con el que se arma el número de celular de tus clientes, para los avisos de
          fiado por WhatsApp.
        </p>
        <select
          value={prefijoPais}
          onChange={(e) => cambiarPrefijoPais(e.target.value)}
          disabled={!contenedor}
          className="mt-3 h-11 w-full rounded-xl border border-linea bg-white px-3 text-sm disabled:opacity-40"
        >
          {PAISES_AMERICA.map((p) => (
            <option key={p.prefijo} value={p.prefijo}>
              +{p.prefijo} {p.nombre}
            </option>
          ))}
        </select>
      </section>

      <section className="mt-6 rounded-xl border border-linea p-4">
        <p className="text-sm font-semibold text-tinta">Activar Premium con un código</p>
        <p className="mt-1 text-xs text-tinta/60">
          1. Manda este ID a quien te da soporte por WhatsApp. 2. Pega acá el código que te
          responda.
        </p>

        <div className="mt-3">
          <p className="text-xs text-tinta/50">ID de este dispositivo</p>
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-linea bg-papel px-3 py-2">
            <code className="flex-1 select-all break-all text-sm text-tinta">{idDispositivo}</code>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(idDispositivo)}
              className="shrink-0 text-xs font-semibold text-bodega-oscuro"
            >
              Copiar
            </button>
          </div>
        </div>

        <div className="mt-3">
          <p className="text-xs text-tinta/50">Código de activación</p>
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
