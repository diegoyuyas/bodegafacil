'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import type { EstadoPlan } from '@/core/plan';
import {
  CLAVE_NOMBRE_TIENDA,
  NOMBRE_TIENDA_PREDETERMINADO,
  obtenerNombreTienda,
} from '@/core/configuracion';
import {
  CLAVE_TIENDA_CONTACTO,
  CLAVE_TIENDA_DOCUMENTO,
  CLAVE_TIENDA_LEYENDA,
  CLAVE_TIENDA_UBICACION,
  LONGITUD_MAXIMA_CONTACTO,
  LONGITUD_MAXIMA_LEYENDA,
  LONGITUD_MAXIMA_UBICACION,
} from '@/core/informacion-tienda';
import { ErrorDeNegocio, validarRuc } from '@/core/reglas-negocio';

export default function PaginaInformacionNegocio() {
  const { contenedor, cargando, error } = usarContenedor();

  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [nombreTienda, setNombreTienda] = useState('');
  const [documento, setDocumento] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [contacto, setContacto] = useState('');
  const [leyenda, setLeyenda] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [mensajeEsError, setMensajeEsError] = useState(false);

  useEffect(() => {
    if (!contenedor) return;
    const c = contenedor.configuracion;
    setEstadoPlan(contenedor.plan.obtenerEstado());
    setNombreTienda(obtenerNombreTienda(c.obtenerValor(CLAVE_NOMBRE_TIENDA)));
    setDocumento(c.obtenerValor(CLAVE_TIENDA_DOCUMENTO) ?? '');
    setUbicacion(c.obtenerValor(CLAVE_TIENDA_UBICACION) ?? '');
    setContacto(c.obtenerValor(CLAVE_TIENDA_CONTACTO) ?? '');
    setLeyenda(c.obtenerValor(CLAVE_TIENDA_LEYENDA) ?? '');
  }, [contenedor]);

  const esPremium = estadoPlan?.tipo === 'premium';

  function establecerOEliminar(clave: string, valor: string) {
    if (!contenedor) return;
    const limpio = valor.trim();
    if (limpio) contenedor.configuracion.establecerValor(clave, limpio);
    else contenedor.configuracion.eliminarValor(clave);
  }

  async function guardar() {
    if (!contenedor || !esPremium) return;
    setMensaje(null);
    setMensajeEsError(false);

    const documentoLimpio = documento.trim();
    if (documentoLimpio) {
      try {
        validarRuc(documentoLimpio); // mismo patrón alfanumérico ≤15 que DNI/RUC en el resto de la app
      } catch (e) {
        setMensajeEsError(true);
        setMensaje(e instanceof ErrorDeNegocio ? e.message : 'DNI o RUC inválido.');
        return;
      }
    }

    setGuardando(true);
    establecerOEliminar(CLAVE_NOMBRE_TIENDA, nombreTienda);
    establecerOEliminar(CLAVE_TIENDA_DOCUMENTO, documento);
    establecerOEliminar(CLAVE_TIENDA_UBICACION, ubicacion);
    establecerOEliminar(CLAVE_TIENDA_CONTACTO, contacto);
    establecerOEliminar(CLAVE_TIENDA_LEYENDA, leyenda);
    await contenedor.persistir();
    setNombreTienda((v) => v.trim() || NOMBRE_TIENDA_PREDETERMINADO);
    setGuardando(false);
    setMensaje('Información guardada.');
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas/configuracion" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Información del Negocio</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta/60">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      <p className="mt-4 text-sm text-tinta/70">
        Estos datos aparecen en Inicio y en el comprobante impreso (Más &gt; Configuración de
        Impresoras).
      </p>

      {estadoPlan && !esPremium && (
        <section className="mt-6 rounded-xl border border-linea p-5 text-center">
          <p className="text-sm font-semibold text-tinta">Información del Negocio es una función Premium</p>
          <p className="mt-2 text-xs text-tinta/60">Actívala desde el panel de administrador.</p>
        </section>
      )}

      {esPremium && (
        <>
          <section className="mt-6">
            <p className="text-sm font-semibold text-tinta">Nombre del negocio</p>
            <p className="mt-0.5 text-xs text-tinta/50">
              Reemplaza &quot;{NOMBRE_TIENDA_PREDETERMINADO}&quot; en Inicio y en el comprobante.
            </p>
            <input
              value={nombreTienda}
              onChange={(e) => setNombreTienda(e.target.value)}
              placeholder={NOMBRE_TIENDA_PREDETERMINADO}
              maxLength={40}
              className="mt-2 h-11 w-full rounded-xl border border-linea px-3 text-sm"
            />
          </section>

          <section className="mt-6">
            <p className="text-sm font-semibold text-tinta">DNI o RUC</p>
            <p className="mt-0.5 text-xs text-tinta/50">No obligatorio.</p>
            <input
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="Ej. 20123456789"
              maxLength={15}
              className="mt-2 h-11 w-full rounded-xl border border-linea px-3 text-sm"
            />
          </section>

          <section className="mt-6">
            <p className="text-sm font-semibold text-tinta">Ubicación</p>
            <p className="mt-0.5 text-xs text-tinta/50">No obligatorio — hasta {LONGITUD_MAXIMA_UBICACION} caracteres.</p>
            <input
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value.slice(0, LONGITUD_MAXIMA_UBICACION))}
              placeholder="Ej. Jr. Los Pinos 123, Chiclayo"
              maxLength={LONGITUD_MAXIMA_UBICACION}
              className="mt-2 h-11 w-full rounded-xl border border-linea px-3 text-sm"
            />
          </section>

          <section className="mt-6">
            <p className="text-sm font-semibold text-tinta">Contacto</p>
            <p className="mt-0.5 text-xs text-tinta/50">No obligatorio — hasta {LONGITUD_MAXIMA_CONTACTO} caracteres.</p>
            <input
              value={contacto}
              onChange={(e) => setContacto(e.target.value.slice(0, LONGITUD_MAXIMA_CONTACTO))}
              placeholder="Ej. 987654321"
              maxLength={LONGITUD_MAXIMA_CONTACTO}
              className="mt-2 h-11 w-full rounded-xl border border-linea px-3 text-sm"
            />
          </section>

          <section className="mt-6">
            <p className="text-sm font-semibold text-tinta">Leyenda</p>
            <p className="mt-0.5 text-xs text-tinta/50">
              Mensaje libre debajo del comprobante impreso — hasta {LONGITUD_MAXIMA_LEYENDA} caracteres.
            </p>
            <textarea
              value={leyenda}
              onChange={(e) => setLeyenda(e.target.value.slice(0, LONGITUD_MAXIMA_LEYENDA))}
              placeholder="Ej. Cambios solo con boleta, dentro de 24 horas."
              maxLength={LONGITUD_MAXIMA_LEYENDA}
              rows={3}
              className="mt-2 w-full rounded-xl border border-linea px-3 py-2 text-sm"
            />
          </section>

          {mensaje && (
            <p className={`mt-4 text-sm ${mensajeEsError ? 'text-alerta' : 'text-bodega-oscuro'}`}>{mensaje}</p>
          )}

          <button
            onClick={guardar}
            disabled={guardando}
            className="mt-6 h-12 w-full rounded-xl bg-bodega text-sm font-semibold text-white disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Guardar información'}
          </button>
        </>
      )}
    </div>
  );
}
