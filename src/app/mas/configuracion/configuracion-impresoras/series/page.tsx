'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EtiquetaCampo, VentanaFormulario } from '@/components/ventana-formulario';
import { usarContenedor } from '@/hooks/usar-contenedor';
import {
  CLAVE_SERIES_DIGITOS_NUMERO,
  CLAVE_SERIES_LARGO_SERIE,
} from '@/core/configuracion';
import {
  DIGITOS_NUMERO_PERMITIDOS,
  ETIQUETA_COMPROBANTE,
  LARGOS_SERIE_PERMITIDOS,
  TIPOS_SERIE,
  digitosNumeroDeConfiguracion,
  ejemploComprobante,
  formatearComprobante,
  largoSerieDeConfiguracion,
  seriesDisponibles,
  sugerirSerie,
  validarSerie,
  validarSerieNueva,
  type SerieComprobante,
  type TipoSerie,
} from '@/core/comprobantes';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import type { AsignacionSerieUsuario } from '@/core/repositorios';
import type { Usuario } from '@/core/usuarios';

/**
 * Más > Configuración > Configuración de Impresión > Configuración de Series (Premium, solo administradores).
 * Crear y editar series de Boleta y Factura, elegir cuál es la predeterminada y qué serie usa cada usuario.
 * Las series son NO electrónicas: no se envía nada a SUNAT.
 */

const TITULO_TIPO: Record<TipoSerie, string> = { boleta: 'Boletas', factura: 'Facturas' };

type Formulario = { tipo: 'nueva' } | { tipo: 'editar'; serie: SerieComprobante };

interface ResumenEmitido {
  cantidad: number;
  maximo: number | null;
}

function mensajeDeError(e: unknown, porDefecto: string): string {
  return e instanceof ErrorDeNegocio ? e.message : porDefecto;
}

function Opciones<T extends number | string>({
  valores,
  valor,
  onChange,
  etiqueta,
  deshabilitado,
  nombre,
}: {
  valores: readonly T[];
  valor: T;
  onChange: (v: T) => void;
  etiqueta: (v: T) => string;
  deshabilitado?: boolean;
  nombre: string;
}) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label={nombre}>
      {valores.map((v) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={v === valor}
          disabled={deshabilitado}
          onClick={() => onChange(v)}
          className={`h-11 flex-1 rounded-xl border text-sm font-semibold disabled:opacity-50 ${
            v === valor ? 'border-bodega bg-bodega text-white' : 'border-linea bg-white text-tinta'
          }`}
        >
          {etiqueta(v)}
        </button>
      ))}
    </div>
  );
}

function EjemploEnVivo({ texto }: { texto: string | null }) {
  return (
    <div className="rounded-xl bg-papel px-4 py-3">
      <p className="text-xs text-tinta/50">Así se verá en el comprobante</p>
      <p className="mt-0.5 text-base font-extrabold tracking-wide text-bodega-oscuro">{texto ?? '—'}</p>
    </div>
  );
}

export default function PaginaConfiguracionSeries() {
  const { contenedor, cargando, error } = usarContenedor();

  const [esPremium, setEsPremium] = useState(false);
  const [series, setSeries] = useState<SerieComprobante[]>([]);
  const [emitidos, setEmitidos] = useState<Record<number, ResumenEmitido>>({});
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [asignaciones, setAsignaciones] = useState<AsignacionSerieUsuario[]>([]);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [avisoEsError, setAvisoEsError] = useState(false);

  // Campos del formulario (nueva o editar).
  const [tipo, setTipo] = useState<TipoSerie>('boleta');
  const [largoSerie, setLargoSerie] = useState<number>(4);
  const [texto, setTexto] = useState('');
  const [digitos, setDigitos] = useState<number>(7);
  const [siguiente, setSiguiente] = useState('1');
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const recargar = useCallback(() => {
    if (!contenedor) return;
    setEsPremium(seriesDisponibles(contenedor.plan.obtenerEstado().tipo === 'premium'));
    const lista = contenedor.series.listar();
    setSeries(lista);
    const resumen: Record<number, ResumenEmitido> = {};
    for (const s of lista) resumen[s.id] = contenedor.series.resumenEmitido(s.serie);
    setEmitidos(resumen);
    setUsuarios(contenedor.usuarios.listarTodos());
    setAsignaciones(contenedor.series.listarAsignaciones());
  }, [contenedor]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  function mostrarAviso(mensaje: string, esError = false) {
    setAviso(mensaje);
    setAvisoEsError(esError);
  }

  function abrirNueva() {
    if (!contenedor) return;
    const largo = largoSerieDeConfiguracion(contenedor.configuracion.obtenerValor(CLAVE_SERIES_LARGO_SERIE));
    setTipo('boleta');
    setLargoSerie(largo);
    setTexto(sugerirSerie('boleta', largo));
    setDigitos(digitosNumeroDeConfiguracion(contenedor.configuracion.obtenerValor(CLAVE_SERIES_DIGITOS_NUMERO)));
    setSiguiente('1');
    setErrorForm(null);
    setAviso(null);
    setFormulario({ tipo: 'nueva' });
  }

  function abrirEditar(serie: SerieComprobante) {
    setTexto(serie.serie);
    setDigitos(serie.digitosNumero);
    setSiguiente(String(serie.siguienteNumero));
    setErrorForm(null);
    setAviso(null);
    setFormulario({ tipo: 'editar', serie });
  }

  function cerrarFormulario() {
    setFormulario(null);
    setErrorForm(null);
  }

  function cambiarTipo(nuevo: TipoSerie) {
    // Si todavía tiene la serie sugerida, se cambia por la sugerida del otro tipo (B001 ↔ F001).
    if (texto === '' || texto === sugerirSerie(tipo, largoSerie)) setTexto(sugerirSerie(nuevo, largoSerie));
    setTipo(nuevo);
  }

  function cambiarLargo(nuevo: number) {
    if (texto === '' || texto === sugerirSerie(tipo, largoSerie)) setTexto(sugerirSerie(tipo, nuevo));
    setLargoSerie(nuevo);
  }

  async function guardar() {
    if (!contenedor || !formulario) return;
    setErrorForm(null);
    setGuardando(true);
    try {
      const numero = Number(siguiente);
      if (formulario.tipo === 'nueva') {
        const serie = validarSerieNueva(texto, largoSerie, tipo);
        contenedor.series.crear({ tipo, serie, digitosNumero: digitos, siguienteNumero: numero });
        // Lo elegido queda como valor por defecto para la próxima serie.
        contenedor.configuracion.establecerValor(CLAVE_SERIES_LARGO_SERIE, String(largoSerie));
        contenedor.configuracion.establecerValor(CLAVE_SERIES_DIGITOS_NUMERO, String(digitos));
        await contenedor.persistir();
        mostrarAviso(`Serie ${serie} creada.`);
      } else {
        const actual = formulario.serie;
        const cambios: { serie?: string; digitosNumero?: number; siguienteNumero?: number } = {};
        const serieNueva = validarSerie(texto);
        if (serieNueva !== actual.serie) cambios.serie = serieNueva;
        if (digitos !== actual.digitosNumero) cambios.digitosNumero = digitos;
        if (numero !== actual.siguienteNumero) cambios.siguienteNumero = numero;
        if (Object.keys(cambios).length === 0) {
          cerrarFormulario();
          return;
        }
        contenedor.series.actualizar(actual.id, cambios);
        await contenedor.persistir();
        mostrarAviso('Cambios guardados.');
      }
      cerrarFormulario();
      recargar();
    } catch (e) {
      setErrorForm(mensajeDeError(e, 'No se pudo guardar la serie.'));
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarActiva(serie: SerieComprobante, activo: boolean) {
    if (!contenedor) return;
    try {
      contenedor.series.establecerActiva(serie.id, activo);
      await contenedor.persistir();
      mostrarAviso(activo ? `Serie ${serie.serie} activada.` : `Serie ${serie.serie} desactivada. Sus números ya emitidos se conservan.`);
      recargar();
    } catch (e) {
      mostrarAviso(mensajeDeError(e, 'No se pudo cambiar la serie.'), true);
    }
  }

  async function hacerPredeterminada(serie: SerieComprobante) {
    if (!contenedor) return;
    try {
      contenedor.series.establecerPredeterminada(serie.id);
      await contenedor.persistir();
      mostrarAviso(`La serie ${serie.serie} ahora es la predeterminada de ${TITULO_TIPO[serie.tipo].toLowerCase()}.`);
      recargar();
    } catch (e) {
      mostrarAviso(mensajeDeError(e, 'No se pudo cambiar la serie.'), true);
    }
  }

  async function asignar(usuario: Usuario, tipoSerie: TipoSerie, valor: string) {
    if (!contenedor) return;
    try {
      contenedor.series.asignarAUsuario(usuario.id, tipoSerie, valor === '' ? null : Number(valor));
      await contenedor.persistir();
      mostrarAviso(`Listo: se guardó la serie de ${usuario.nombre}.`);
      recargar();
    } catch (e) {
      mostrarAviso(mensajeDeError(e, 'No se pudo asignar la serie.'), true);
    }
  }

  const usuariosEstandar = usuarios.filter((u) => u.activo && u.rol === 'estandar');
  const activasDe = (t: TipoSerie) => series.filter((s) => s.activo && s.tipo === t);
  const predeterminadaDe = (t: TipoSerie) => activasDe(t).find((s) => s.predeterminada);

  const numeroEscrito = Number(siguiente);
  const ejemplo = ejemploComprobante(texto, digitos, Number.isInteger(numeroEscrito) ? numeroEscrito : 0);

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas/configuracion/configuracion-impresoras" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Configuración de Series</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta/60">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      <p className="mt-4 text-sm text-tinta/70">
        Crea una serie de Boleta o de Factura para numerar tus comprobantes (ejemplo: B001-0000001). Mientras no
        tengas ninguna, todas tus ventas salen como Nota de venta.
      </p>

      {contenedor && !esPremium && (
        <section className="mt-6 rounded-xl border border-linea p-5 text-center">
          <p className="text-sm font-semibold text-tinta">Las series de Boleta y Factura son una función Premium</p>
          <p className="mt-2 text-xs text-tinta/60">
            Con tu plan actual solo puedes hacer Notas de venta. Tus series se guardan: si activas Premium otra vez, las
            tendrás como las dejaste.
          </p>
        </section>
      )}

      {aviso && <p className={`mt-4 text-sm ${avisoEsError ? 'text-alerta' : 'text-bodega-oscuro'}`}>{aviso}</p>}

      {contenedor && esPremium && (
        <>
          <button
            type="button"
            onClick={abrirNueva}
            className="mt-6 h-12 w-full rounded-xl bg-bodega text-sm font-semibold text-white active:bg-bodega-oscuro"
          >
            + Nueva serie
          </button>

          {series.length === 0 && (
            <section className="mt-6 rounded-xl border border-linea p-5 text-center">
              <p className="text-sm font-semibold text-tinta">Todavía no tienes series</p>
              <p className="mt-2 text-xs text-tinta/60">
                Toca «Nueva serie». Mientras tanto, todas tus ventas salen como Nota de venta.
              </p>
            </section>
          )}

          {TIPOS_SERIE.map((t) => {
            const delTipo = series.filter((s) => s.tipo === t);
            if (delTipo.length === 0) return null;
            return (
              <section key={t} className="mt-6">
                <h2 className="text-sm font-extrabold text-bodega-oscuro">{TITULO_TIPO[t]}</h2>
                <ul className="mt-2 space-y-3">
                  {delTipo.map((s) => {
                    const resumen = emitidos[s.id];
                    const hayVarias = activasDe(t).length > 1;
                    return (
                      <li key={s.id} className={`rounded-xl border border-linea p-4 ${s.activo ? '' : 'opacity-60'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-extrabold text-tinta">{s.serie}</p>
                            <p className="mt-0.5 text-xs text-tinta/60">
                              Siguiente: {formatearComprobante(s.serie, s.siguienteNumero, s.digitosNumero)}
                            </p>
                            <p className="text-xs text-tinta/50">
                              {resumen && resumen.cantidad > 0
                                ? `Ya se usó en ${resumen.cantidad} ${resumen.cantidad === 1 ? 'venta' : 'ventas'}`
                                : 'Todavía no se usa'}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {s.activo && s.predeterminada && (
                              <span className="rounded-full bg-bodega-claro px-2 py-0.5 text-xs font-semibold text-bodega-oscuro">
                                Predeterminada
                              </span>
                            )}
                            {!s.activo && (
                              <span className="rounded-full bg-linea px-2 py-0.5 text-xs font-semibold text-tinta/60">
                                Desactivada
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => abrirEditar(s)}
                            className="h-10 rounded-xl border border-bodega px-4 text-sm font-semibold text-bodega"
                          >
                            Editar
                          </button>
                          {s.activo && !s.predeterminada && hayVarias && (
                            <button
                              type="button"
                              onClick={() => hacerPredeterminada(s)}
                              className="h-10 rounded-xl border border-linea px-4 text-sm font-semibold text-tinta"
                            >
                              Hacer predeterminada
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => cambiarActiva(s, !s.activo)}
                            className="h-10 rounded-xl border border-linea px-4 text-sm font-semibold text-tinta"
                          >
                            {s.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {series.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-extrabold text-bodega-oscuro">Serie de cada usuario</h2>
              <p className="mt-1 text-xs text-tinta/60">
                Elige qué serie usa cada usuario estándar. Si no eliges ninguna, usa la predeterminada. Los
                administradores siempre usan la predeterminada.
              </p>
              {usuariosEstandar.length === 0 ? (
                <p className="mt-3 text-xs text-tinta/50">
                  Aún no hay usuarios estándar. Cuando los crees en Administración de Usuarios, aquí podrás elegir su
                  serie.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {usuariosEstandar.map((u) => (
                    <li key={u.id} className="rounded-xl border border-linea p-4">
                      <p className="text-sm font-semibold text-tinta">{u.nombre}</p>
                      <div className="mt-2 space-y-2">
                        {TIPOS_SERIE.map((t) => {
                          const opciones = activasDe(t);
                          if (opciones.length === 0) return null;
                          const asignada = asignaciones.find((a) => a.usuarioId === u.id && a.tipo === t);
                          const valor = asignada && opciones.some((s) => s.id === asignada.serieId) ? String(asignada.serieId) : '';
                          const porDefecto = predeterminadaDe(t);
                          return (
                            <div key={t}>
                              <p className="text-xs text-tinta/50">{ETIQUETA_COMPROBANTE[t]}</p>
                              <select
                                value={valor}
                                onChange={(e) => asignar(u, t, e.target.value)}
                                className="mt-1 h-11 w-full rounded-xl border border-linea bg-white px-3 text-sm"
                              >
                                <option value="">Predeterminada{porDefecto ? ` (${porDefecto.serie})` : ''}</option>
                                {opciones.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.serie}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {formulario && (
        <VentanaFormulario titulo={formulario.tipo === 'nueva' ? 'Nueva serie' : `Editar serie ${formulario.serie.serie}`} onCerrar={cerrarFormulario}>
          {formulario.tipo === 'nueva' ? (
            <>
              <div>
                <EtiquetaCampo>¿De qué comprobante?</EtiquetaCampo>
                <Opciones valores={TIPOS_SERIE} valor={tipo} onChange={cambiarTipo} etiqueta={(v) => ETIQUETA_COMPROBANTE[v]} nombre="Tipo de comprobante" />
              </div>
              <div>
                <EtiquetaCampo>Caracteres de la serie</EtiquetaCampo>
                <Opciones valores={LARGOS_SERIE_PERMITIDOS} valor={largoSerie} onChange={cambiarLargo} etiqueta={(v) => `${v} caracteres`} nombre="Caracteres de la serie" />
              </div>
            </>
          ) : (
            <p className="text-sm text-tinta/70">Comprobante: {ETIQUETA_COMPROBANTE[formulario.serie.tipo]}</p>
          )}

          {(() => {
            const usada = formulario.tipo === 'editar' && (emitidos[formulario.serie.id]?.cantidad ?? 0) > 0;
            const maximo = formulario.tipo === 'editar' ? emitidos[formulario.serie.id]?.maximo ?? null : null;
            return (
              <>
                <div>
                  <EtiquetaCampo>Serie</EtiquetaCampo>
                  <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    maxLength={formulario.tipo === 'nueva' ? largoSerie : 4}
                    disabled={usada}
                    autoCapitalize="characters"
                    placeholder={sugerirSerie(formulario.tipo === 'nueva' ? tipo : formulario.serie.tipo, largoSerie)}
                    className="h-11 w-full rounded-xl border border-linea px-3 text-base font-semibold tracking-wide disabled:bg-papel disabled:text-tinta/50"
                  />
                  <p className="mt-1 text-xs text-tinta/50">
                    {usada
                      ? 'Esta serie ya se usó en ventas: no se puede cambiar. Si necesitas otra, crea una serie nueva.'
                      : 'Letras y números, sin espacios (ejemplo: B001).'}
                  </p>
                </div>

                <div>
                  <EtiquetaCampo>Dígitos del número</EtiquetaCampo>
                  <Opciones valores={DIGITOS_NUMERO_PERMITIDOS} valor={digitos} onChange={setDigitos} etiqueta={(v) => `${v} dígitos`} deshabilitado={usada} nombre="Dígitos del número" />
                </div>

                <div>
                  <EtiquetaCampo>{formulario.tipo === 'nueva' ? 'Empieza en el número' : 'Siguiente número'}</EtiquetaCampo>
                  <input
                    value={siguiente}
                    onChange={(e) => setSiguiente(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    className="h-11 w-full rounded-xl border border-linea px-3 text-base"
                  />
                  <p className="mt-1 text-xs text-tinta/50">
                    {formulario.tipo === 'nueva'
                      ? 'Déjalo en 1 si es una serie nueva. Si ya usas un talonario, pon el número por el que vas.'
                      : `Solo puede subir, nunca bajar: así los números siempre continúan.${maximo !== null ? ` Último emitido: ${maximo}.` : ''}`}
                  </p>
                </div>
              </>
            );
          })()}

          <EjemploEnVivo texto={ejemplo} />

          {errorForm && <p className="text-sm text-alerta">{errorForm}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={cerrarFormulario} className="h-12 flex-1 rounded-xl border border-linea text-sm font-semibold text-tinta">
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="h-12 flex-1 rounded-xl bg-bodega text-sm font-semibold text-white disabled:opacity-40"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </VentanaFormulario>
      )}
    </div>
  );
}
