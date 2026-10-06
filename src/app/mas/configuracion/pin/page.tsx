'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import type { EstadoPlan } from '@/core/plan';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import type { DestinoPin } from '@/core/bloqueo-pin';

const OPCIONES_PIN: { destino: DestinoPin; titulo: string; descripcion: string }[] = [
  {
    destino: 'ingresar',
    titulo: 'Ingresar al app',
    descripcion: 'Pide el PIN cada vez que abres Vende Fácil.',
  },
  {
    destino: 'anular',
    titulo: 'Anular transacciones',
    descripcion: 'Anular ventas, compras, fiados y pagos de fiados.',
  },
  {
    destino: 'modificar',
    titulo: 'Modificar o ajustar información',
    descripcion:
      'Editar productos, ajustar stock, editar clientes y proveedores, modificar compras, cobrar fiados y registrar ingresos/egresos de caja.',
  },
];

type Modo = 'inactivo' | 'activo' | 'creando' | 'desactivando' | 'cambiando';

function CampoPin({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-xs text-tinta/50">{etiqueta}</p>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={valor}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        className="mt-1 h-12 w-full rounded-xl border border-linea px-3 text-center text-xl tracking-[0.5em]"
      />
    </div>
  );
}

export default function PaginaConfigurarPin() {
  const { contenedor, cargando, error } = usarContenedor();

  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [pinActivo, setPinActivo] = useState(false);
  const [modo, setModo] = useState<Modo>('inactivo');

  const [pinNuevo, setPinNuevo] = useState('');
  const [pinConfirmar, setPinConfirmar] = useState('');
  const [pinActual, setPinActual] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [mensajeEsError, setMensajeEsError] = useState(false);

  const [destinos, setDestinos] = useState<Record<DestinoPin, boolean>>({
    ingresar: false,
    anular: false,
    modificar: false,
  });
  // Apagar un interruptor exige el PIN actual (si no, cualquiera podría quitar la protección).
  const [apagando, setApagando] = useState<DestinoPin | null>(null);
  const [pinApagar, setPinApagar] = useState('');
  const [errorApagar, setErrorApagar] = useState<string | null>(null);

  function leerDestinos() {
    if (!contenedor) return;
    setDestinos({
      ingresar: contenedor.bloqueoPin.requiereParaDestino('ingresar'),
      anular: contenedor.bloqueoPin.requiereParaDestino('anular'),
      modificar: contenedor.bloqueoPin.requiereParaDestino('modificar'),
    });
  }

  async function alternarDestino(destino: DestinoPin) {
    if (!contenedor) return;
    if (!destinos[destino]) {
      contenedor.bloqueoPin.encenderDestino(destino);
      await contenedor.persistir();
      leerDestinos();
      return;
    }
    setPinApagar('');
    setErrorApagar(null);
    setApagando(destino);
  }

  async function confirmarApagar() {
    if (!contenedor || !apagando) return;
    const ok = await contenedor.bloqueoPin.apagarDestino(apagando, pinApagar);
    if (!ok) {
      setErrorApagar('PIN incorrecto.');
      setPinApagar('');
      return;
    }
    await contenedor.persistir();
    setApagando(null);
    setPinApagar('');
    leerDestinos();
  }

  useEffect(() => {
    if (!contenedor) return;
    setEstadoPlan(contenedor.plan.obtenerEstado());
    const activo = contenedor.bloqueoPin.estaActivo();
    setPinActivo(activo);
    setModo(activo ? 'activo' : 'inactivo');
    leerDestinos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenedor]);

  const esPremium = estadoPlan?.tipo === 'premium';

  function limpiarCampos() {
    setPinNuevo('');
    setPinConfirmar('');
    setPinActual('');
    setMensaje(null);
    setMensajeEsError(false);
  }

  async function confirmarCrearPin() {
    if (!contenedor) return;
    setMensaje(null);
    if (pinNuevo.length !== 4) {
      setMensajeEsError(true);
      setMensaje('El PIN debe tener 4 dígitos.');
      return;
    }
    if (pinNuevo !== pinConfirmar) {
      setMensajeEsError(true);
      setMensaje('Los dos PIN no coinciden.');
      return;
    }
    setProcesando(true);
    try {
      await contenedor.bloqueoPin.activar(pinNuevo);
      await contenedor.persistir();
      setPinActivo(true);
      setModo('activo');
      leerDestinos();
      limpiarCampos();
    } catch (e) {
      setMensajeEsError(true);
      setMensaje(e instanceof ErrorDeNegocio ? e.message : 'No se pudo activar el PIN.');
    } finally {
      setProcesando(false);
    }
  }

  async function confirmarDesactivarPin() {
    if (!contenedor) return;
    setProcesando(true);
    setMensaje(null);
    const ok = await contenedor.bloqueoPin.desactivar(pinActual);
    setProcesando(false);
    if (!ok) {
      setMensajeEsError(true);
      setMensaje('PIN incorrecto.');
      setPinActual('');
      return;
    }
    await contenedor.persistir();
    setPinActivo(false);
    setModo('inactivo');
    limpiarCampos();
  }

  async function confirmarCambiarPin() {
    if (!contenedor) return;
    setMensaje(null);
    if (pinNuevo.length !== 4) {
      setMensajeEsError(true);
      setMensaje('El PIN nuevo debe tener 4 dígitos.');
      return;
    }
    if (pinNuevo !== pinConfirmar) {
      setMensajeEsError(true);
      setMensaje('Los dos PIN nuevos no coinciden.');
      return;
    }
    setProcesando(true);
    const ok = await contenedor.bloqueoPin.cambiarPin(pinActual, pinNuevo);
    setProcesando(false);
    if (!ok) {
      setMensajeEsError(true);
      setMensaje('El PIN actual no es correcto.');
      return;
    }
    await contenedor.persistir();
    setModo('activo');
    limpiarCampos();
    setMensajeEsError(false);
    setMensaje('PIN actualizado.');
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas/configuracion" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Configurar PIN</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta/60">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      <p className="mt-4 text-sm text-tinta/70">
        Con un PIN configurado eliges, con los interruptores, en qué momentos Vende Fácil te lo pide.
      </p>

      {estadoPlan && !esPremium && (
        <section className="mt-6 rounded-xl border border-linea p-5 text-center">
          <p className="text-sm font-semibold text-tinta">Configurar PIN es una función Premium</p>
          <p className="mt-2 text-xs text-tinta/60">Actívala desde el panel de administrador.</p>
        </section>
      )}

      {esPremium && (
        <>
          <div className="mt-6 rounded-xl border border-alerta/40 bg-alerta/10 p-3">
            <p className="text-xs font-semibold text-alerta">⚠️ Si olvidas tu PIN…</p>
            <p className="mt-1 text-xs text-tinta/70">
              …y tienes encendido "Ingresar al app", no podrás volver a entrar a Vende Fácil hasta borrar los datos de la aplicación desde los
              ajustes del teléfono — y eso borra también tus ventas, productos y todo lo demás. Anótalo en
              un lugar seguro.
            </p>
          </div>

          {modo === 'inactivo' && (
            <button
              onClick={() => {
                limpiarCampos();
                setModo('creando');
              }}
              className="mt-6 h-12 w-full rounded-xl bg-bodega text-sm font-semibold text-white active:bg-bodega-oscuro"
            >
              Activar PIN de acceso
            </button>
          )}

          {modo === 'activo' && (
            <div className="mt-6 flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-xl border border-linea p-4">
                <p className="text-sm font-semibold text-tinta">PIN activado</p>
                <span className="text-xs font-semibold text-bodega-oscuro">✓ Configurado</span>
              </div>

              <p className="mt-2 text-xs font-semibold text-tinta/70">Pedir el PIN para:</p>
              {OPCIONES_PIN.map((opcion) => {
                const encendido = destinos[opcion.destino];
                return (
                  <div key={opcion.destino} className="rounded-xl border border-linea p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-tinta">{opcion.titulo}</p>
                        <p className="mt-0.5 text-xs text-tinta/60">{opcion.descripcion}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={encendido}
                        aria-label={opcion.titulo}
                        onClick={() => alternarDestino(opcion.destino)}
                        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                          encendido ? 'bg-bodega' : 'bg-tinta/20'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
                            encendido ? 'left-[22px]' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </div>

                    {apagando === opcion.destino && (
                      <div className="mt-3 flex flex-col gap-2 border-t border-linea pt-3">
                        <CampoPin etiqueta="Ingresa tu PIN para apagarlo" valor={pinApagar} onChange={setPinApagar} />
                        {errorApagar && <p className="text-xs text-alerta">{errorApagar}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={() => setApagando(null)}
                            className="h-10 flex-1 rounded-lg border border-linea text-xs font-semibold text-tinta/70"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={confirmarApagar}
                            disabled={pinApagar.length !== 4}
                            className="h-10 flex-1 rounded-lg bg-bodega text-xs font-semibold text-white disabled:opacity-40"
                          >
                            Apagar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                onClick={() => {
                  limpiarCampos();
                  setModo('cambiando');
                }}
                className="h-12 w-full rounded-xl border border-bodega text-sm font-semibold text-bodega"
              >
                Cambiar PIN
              </button>
              <button
                onClick={() => {
                  limpiarCampos();
                  setModo('desactivando');
                }}
                className="h-12 w-full rounded-xl border border-alerta text-sm font-semibold text-alerta"
              >
                Desactivar PIN
              </button>
            </div>
          )}

          {modo === 'creando' && (
            <section className="mt-6 flex flex-col gap-3">
              <CampoPin etiqueta="PIN nuevo (4 dígitos)" valor={pinNuevo} onChange={setPinNuevo} />
              <CampoPin etiqueta="Confirma el PIN" valor={pinConfirmar} onChange={setPinConfirmar} />
              {mensaje && (
                <p className={`text-sm ${mensajeEsError ? 'text-alerta' : 'text-bodega-oscuro'}`}>{mensaje}</p>
              )}
              <button
                onClick={confirmarCrearPin}
                disabled={procesando || pinNuevo.length !== 4 || pinConfirmar.length !== 4}
                className="h-12 w-full rounded-xl bg-bodega text-sm font-semibold text-white disabled:opacity-40"
              >
                {procesando ? 'Guardando…' : 'Activar PIN'}
              </button>
              <button
                onClick={() => {
                  limpiarCampos();
                  setModo(pinActivo ? 'activo' : 'inactivo');
                }}
                className="h-11 w-full text-sm font-semibold text-tinta/60"
              >
                Cancelar
              </button>
            </section>
          )}

          {modo === 'desactivando' && (
            <section className="mt-6 flex flex-col gap-3">
              <CampoPin etiqueta="Ingresa tu PIN actual para desactivar" valor={pinActual} onChange={setPinActual} />
              {mensaje && <p className="text-sm text-alerta">{mensaje}</p>}
              <button
                onClick={confirmarDesactivarPin}
                disabled={procesando || pinActual.length !== 4}
                className="h-12 w-full rounded-xl border border-alerta text-sm font-semibold text-alerta disabled:opacity-40"
              >
                {procesando ? 'Verificando…' : 'Desactivar PIN'}
              </button>
              <button
                onClick={() => {
                  limpiarCampos();
                  setModo('activo');
                }}
                className="h-11 w-full text-sm font-semibold text-tinta/60"
              >
                Cancelar
              </button>
            </section>
          )}

          {modo === 'cambiando' && (
            <section className="mt-6 flex flex-col gap-3">
              <CampoPin etiqueta="PIN actual" valor={pinActual} onChange={setPinActual} />
              <CampoPin etiqueta="PIN nuevo (4 dígitos)" valor={pinNuevo} onChange={setPinNuevo} />
              <CampoPin etiqueta="Confirma el PIN nuevo" valor={pinConfirmar} onChange={setPinConfirmar} />
              {mensaje && (
                <p className={`text-sm ${mensajeEsError ? 'text-alerta' : 'text-bodega-oscuro'}`}>{mensaje}</p>
              )}
              <button
                onClick={confirmarCambiarPin}
                disabled={procesando || pinActual.length !== 4 || pinNuevo.length !== 4 || pinConfirmar.length !== 4}
                className="h-12 w-full rounded-xl bg-bodega text-sm font-semibold text-white disabled:opacity-40"
              >
                {procesando ? 'Guardando…' : 'Guardar PIN nuevo'}
              </button>
              <button
                onClick={() => {
                  limpiarCampos();
                  setModo('activo');
                }}
                className="h-11 w-full text-sm font-semibold text-tinta/60"
              >
                Cancelar
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
