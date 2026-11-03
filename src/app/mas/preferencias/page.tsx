'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { usarApariencia } from '@/components/proveedor-apariencia';
import { OPCIONES_APARIENCIA } from '@/core/apariencia';
import { CLAVE_MONEDA, MONEDAS_DISPONIBLES, obtenerMoneda } from '@/core/moneda';
import { CLAVE_PREFIJO_PAIS, PAISES_AMERICA, obtenerPrefijoPais } from '@/core/paises';

export default function PaginaPreferencias() {
  const { contenedor, cargando, error } = usarContenedor();
  const { apariencia, cambiarApariencia } = usarApariencia();

  const [codigoMoneda, setCodigoMoneda] = useState(obtenerMoneda(null).codigo);
  const [prefijoPais, setPrefijoPais] = useState(obtenerPrefijoPais(null));

  useEffect(() => {
    if (!contenedor) return;
    setCodigoMoneda(obtenerMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)).codigo);
    setPrefijoPais(obtenerPrefijoPais(contenedor.configuracion.obtenerValor(CLAVE_PREFIJO_PAIS)));
  }, [contenedor]);

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

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas" className="text-xl text-tinta-suave" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Preferencias</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta-suave">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      <section className="mt-6">
        <p className="text-sm font-semibold text-tinta">Tipo de moneda</p>
        <p className="mt-0.5 text-xs text-tinta-suave">
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
        <p className="mt-0.5 text-xs text-tinta-suave">
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

      <section className="mt-6">
        <p className="text-sm font-semibold text-tinta">Apariencia</p>
        <p className="mt-0.5 text-xs text-tinta-suave">
          Elige cómo se ve la app. «Automático» sigue el modo claro u oscuro de tu teléfono. Este cambio es solo de este
          teléfono.
        </p>
        <div role="radiogroup" aria-label="Apariencia" className="mt-3 flex gap-2">
          {OPCIONES_APARIENCIA.map((opcion) => {
            const elegida = apariencia === opcion.valor;
            return (
              <button
                key={opcion.valor}
                type="button"
                role="radio"
                aria-checked={elegida}
                onClick={() => cambiarApariencia(opcion.valor)}
                className={`h-11 flex-1 rounded-xl border text-sm font-semibold ${
                  elegida ? 'border-bodega bg-bodega-claro text-bodega-oscuro' : 'border-linea text-tinta-suave'
                }`}
              >
                {opcion.etiqueta}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
