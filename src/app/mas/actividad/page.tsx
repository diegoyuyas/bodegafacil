'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { usarSesion } from '@/components/sesion-usuario';
import { textoDeActividad, type ActividadUsuario, type ResumenVentasUsuario } from '@/core/actividad';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import { formatearFechaHora, hoyLocalSql, sumarDiasLocalSql } from '@/core/tiempo';
import type { Usuario } from '@/core/usuarios';

type Periodo = 'hoy' | 'semana' | 'mes';

const PERIODOS: { valor: Periodo; etiqueta: string; dias: number }[] = [
  { valor: 'hoy', etiqueta: 'Hoy', dias: 0 },
  { valor: 'semana', etiqueta: '7 días', dias: -6 },
  { valor: 'mes', etiqueta: '30 días', dias: -29 },
];

/**
 * Más > Actividad de usuarios (solo administradores, solo con el control de usuarios rigiendo):
 * cuánto vendió cada usuario y qué acciones delicadas hizo cada uno (anular, caja, cambios...),
 * con quién las autorizó cuando hizo falta un administrador.
 */
export default function PaginaActividad() {
  const { contenedor, cargando, error } = usarContenedor();
  const { controlVigente } = usarSesion();

  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const [usuarioFiltro, setUsuarioFiltro] = useState<number | null>(null);
  const [simbolo, setSimbolo] = useState(obtenerSimboloMoneda(null));
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [actividad, setActividad] = useState<ActividadUsuario[]>([]);
  const [resumen, setResumen] = useState<ResumenVentasUsuario[]>([]);

  const desde = useMemo(() => sumarDiasLocalSql(PERIODOS.find((p) => p.valor === periodo)?.dias ?? 0), [periodo]);

  useEffect(() => {
    if (!contenedor) return;
    const hasta = hoyLocalSql();
    setSimbolo(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
    setUsuarios(contenedor.usuarios.listarTodos());
    setActividad(contenedor.actividad.listar({ desde, hasta, usuarioId: usuarioFiltro }));
    setResumen(contenedor.actividad.resumenVentasPorUsuario(desde, hasta));
  }, [contenedor, desde, usuarioFiltro]);

  const resumenVisible = usuarioFiltro === null ? resumen : resumen.filter((r) => r.usuarioId === usuarioFiltro);

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Actividad de usuarios</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta/60">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      {controlVigente === false && (
        <section className="mt-6 rounded-xl border border-linea p-5 text-center">
          <p className="text-sm font-semibold text-tinta">Aquí verás qué hace cada usuario</p>
          <p className="mt-2 text-xs text-tinta/60">
            Se registra solo cuando el control de usuarios está encendido (Más › Configuración › Administración de Usuarios).
          </p>
        </section>
      )}

      {contenedor && controlVigente && (
        <>
          <div className="mt-5 flex gap-2" role="radiogroup" aria-label="Periodo">
            {PERIODOS.map((p) => (
              <button
                key={p.valor}
                type="button"
                role="radio"
                aria-checked={periodo === p.valor}
                onClick={() => setPeriodo(p.valor)}
                className={`h-11 flex-1 rounded-xl border text-sm font-semibold ${
                  periodo === p.valor ? 'border-bodega bg-bodega text-white' : 'border-linea bg-white text-tinta'
                }`}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>

          <label className="mt-3 block">
            <span className="text-sm font-bold text-tinta">Usuario:</span>
            <select
              value={usuarioFiltro ?? ''}
              onChange={(e) => setUsuarioFiltro(e.target.value === '' ? null : Number(e.target.value))}
              className="mt-1 h-12 w-full rounded-xl border border-linea bg-white px-3 text-base outline-none focus:border-bodega"
            >
              <option value="">Todos</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>

          <section className="mt-6">
            <h2 className="text-sm font-extrabold text-tinta">Ventas por usuario</h2>
            {resumenVisible.length === 0 ? (
              <p className="mt-2 text-sm text-tinta/60">No hay ventas en este periodo.</p>
            ) : (
              <ul className="mt-2 divide-y divide-linea border-y border-linea">
                {resumenVisible.map((r) => (
                  <li key={r.usuarioId ?? 'sin-usuario'} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-bold text-tinta">{r.usuarioNombre}</p>
                      <p className="text-xs text-tinta/60">
                        {r.cantidad} {r.cantidad === 1 ? 'venta' : 'ventas'}
                        {r.anuladas > 0 && ` · ${r.anuladas} ${r.anuladas === 1 ? 'anulada' : 'anuladas'}`}
                      </p>
                    </div>
                    <p className="text-base font-extrabold text-tinta">{formatearMonto(r.total, simbolo)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-extrabold text-tinta">Acciones registradas</h2>
            {actividad.length === 0 ? (
              <p className="mt-2 text-sm text-tinta/60">No hay acciones registradas en este periodo.</p>
            ) : (
              <ul className="mt-2 divide-y divide-linea border-y border-linea">
                {actividad.map((a) => (
                  <li key={a.id} className="py-3">
                    <p className="text-sm text-tinta">
                      <strong>{a.usuarioNombre}</strong> {textoDeActividad(a)}
                    </p>
                    <p className="mt-0.5 text-xs text-tinta/50">
                      {formatearFechaHora(a.fechaHora)}
                      {a.autorizadoPorNombre && (
                        <span className="font-semibold text-acento-oscuro"> · autorizado por {a.autorizadoPorNombre}</span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
