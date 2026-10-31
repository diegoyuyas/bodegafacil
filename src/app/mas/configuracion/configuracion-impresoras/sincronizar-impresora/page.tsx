'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import type { EstadoPlan } from '@/core/plan';
import {
  CARACTERES_POR_LINEA_MAXIMO,
  CARACTERES_POR_LINEA_MINIMO,
  CARACTERES_POR_PAPEL,
  CLAVE_IMPRESORA_ACTIVA,
  CLAVE_IMPRESORA_CARACTERES,
  CLAVE_IMPRESORA_DIRECCION,
  CLAVE_IMPRESORA_NOMBRE,
  CLAVE_IMPRESORA_PAPEL,
  IMPRESION_BLUETOOTH_DISPONIBLE,
  etiquetaAnchoImpresora,
  leerAnchoImpresora,
  normalizarCaracteresPorLinea,
  papelSugeridoPorNombre,
  type AnchoImpresora,
  type PapelImpresora,
} from '@/core/impresora';
import { CLAVE_NOMBRE_TIENDA, obtenerNombreTienda } from '@/core/configuracion';
import { construirTextoPrueba } from '@/core/comprobante-prueba';
import {
  listarImpresorasEmparejadas,
  imprimirEn,
  type BluetoothDevice,
} from '@/infraestructura/impresora-bluetooth/impresora';
import { Proximamente } from '@/components/proximamente';

export default function PaginaSincronizarImpresora() {
  if (!IMPRESION_BLUETOOTH_DISPONIBLE) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
        <header className="flex items-center gap-3">
          <Link href="/mas/configuracion/configuracion-impresoras" className="text-xl text-tinta/60" aria-label="Volver">
            ←
          </Link>
          <h1 className="text-lg font-extrabold text-bodega-oscuro">Sincronizar Impresora Bluetooth</h1>
        </header>
        <Proximamente
          titulo="Próximamente"
          detalle="La impresión en ticketera Bluetooth está en preparación. Todavía no está disponible, ni siquiera con Premium activo."
        />
      </div>
    );
  }

  const { contenedor, cargando, error } = usarContenedor();

  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [activa, setActiva] = useState(false);
  const [direccionGuardada, setDireccionGuardada] = useState<string | null>(null);
  const [nombreGuardado, setNombreGuardado] = useState<string | null>(null);
  const [ancho, setAncho] = useState<AnchoImpresora>({ papel: '58', caracteres: CARACTERES_POR_PAPEL['58'] });
  const [caracteresOtro, setCaracteresOtro] = useState('40');
  const [papelYaElegido, setPapelYaElegido] = useState(false);

  const [dispositivos, setDispositivos] = useState<BluetoothDevice[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [mensajeEsError, setMensajeEsError] = useState(false);

  useEffect(() => {
    if (!contenedor) return;
    const c = contenedor.configuracion;
    setEstadoPlan(contenedor.plan.obtenerEstado());
    setActiva(c.obtenerValor(CLAVE_IMPRESORA_ACTIVA) === '1');
    setDireccionGuardada(c.obtenerValor(CLAVE_IMPRESORA_DIRECCION));
    setNombreGuardado(c.obtenerValor(CLAVE_IMPRESORA_NOMBRE));
    const anchoGuardado = leerAnchoImpresora(c.obtenerValor(CLAVE_IMPRESORA_PAPEL), c.obtenerValor(CLAVE_IMPRESORA_CARACTERES));
    setAncho(anchoGuardado);
    if (anchoGuardado.papel === 'otro') setCaracteresOtro(String(anchoGuardado.caracteres));
    setPapelYaElegido(c.obtenerValor(CLAVE_IMPRESORA_PAPEL) !== null);
  }, [contenedor]);

  const esPremium = estadoPlan?.tipo === 'premium';

  async function alternarActiva() {
    if (!contenedor || !esPremium) return;
    const nuevoValor = !activa;
    setActiva(nuevoValor);
    contenedor.configuracion.establecerValor(CLAVE_IMPRESORA_ACTIVA, nuevoValor ? '1' : '0');
    await contenedor.persistir();
  }

  /** Guarda el ancho de papel elegido (58, 80 u otro con su cantidad de caracteres). */
  async function guardarAncho(papel: PapelImpresora, caracteresTexto?: string) {
    if (!contenedor) return;
    let caracteres: number = papel === 'otro' ? 0 : CARACTERES_POR_PAPEL[papel];
    if (papel === 'otro') {
      const valido = normalizarCaracteresPorLinea(caracteresTexto ?? caracteresOtro);
      if (valido === null) {
        setMensajeEsError(true);
        setMensaje(`Escribe un número de caracteres por línea entre ${CARACTERES_POR_LINEA_MINIMO} y ${CARACTERES_POR_LINEA_MAXIMO}.`);
        return;
      }
      caracteres = valido;
      contenedor.configuracion.establecerValor(CLAVE_IMPRESORA_CARACTERES, String(valido));
      setCaracteresOtro(String(valido));
    }
    contenedor.configuracion.establecerValor(CLAVE_IMPRESORA_PAPEL, papel);
    await contenedor.persistir();
    setAncho({ papel, caracteres });
    setPapelYaElegido(true);
    setMensajeEsError(false);
    setMensaje(`Ancho del papel: ${etiquetaAnchoImpresora({ papel, caracteres })}. Imprime una prueba para comprobarlo.`);
  }

  async function buscarImpresoras() {
    setMensaje(null);
    setBuscando(true);
    try {
      const encontrados = await listarImpresorasEmparejadas();
      setDispositivos(encontrados);
      if (encontrados.length === 0) {
        setMensajeEsError(false);
        setMensaje(
          'No hay ninguna impresora emparejada todavía. Empareja tu ticketera desde Ajustes > Bluetooth del teléfono primero.',
        );
      }
    } catch (e) {
      setMensajeEsError(true);
      setMensaje(e instanceof Error ? e.message : 'No se pudo buscar impresoras.');
    } finally {
      setBuscando(false);
    }
  }

  async function elegirImpresora(dispositivo: BluetoothDevice) {
    if (!contenedor) return;
    setMensaje(null);
    contenedor.configuracion.establecerValor(CLAVE_IMPRESORA_DIRECCION, dispositivo.address);
    contenedor.configuracion.establecerValor(CLAVE_IMPRESORA_NOMBRE, dispositivo.name || dispositivo.address);
    // Si todavía no se eligió el papel y el nombre de la impresora lo dice (XP-58..., MPT-80...), se preselecciona:
    // es solo una sugerencia, la persona la puede cambiar abajo.
    const sugerido = papelSugeridoPorNombre(dispositivo.name);
    if (sugerido && !papelYaElegido) {
      contenedor.configuracion.establecerValor(CLAVE_IMPRESORA_PAPEL, sugerido);
      setAncho({ papel: sugerido, caracteres: CARACTERES_POR_PAPEL[sugerido] });
      setPapelYaElegido(true);
      setMensajeEsError(false);
      setMensaje(`Por el nombre parece una impresora de papel de ${sugerido} mm. Si no es así, cámbialo en «Ancho del papel».`);
    }
    await contenedor.persistir();
    setDireccionGuardada(dispositivo.address);
    setNombreGuardado(dispositivo.name || dispositivo.address);
    setDispositivos([]);
  }

  async function imprimirPrueba() {
    if (!contenedor || !direccionGuardada) return;
    setMensaje(null);
    setProbando(true);
    try {
      const nombreTienda = obtenerNombreTienda(contenedor.configuracion.obtenerValor(CLAVE_NOMBRE_TIENDA));
      await imprimirEn(direccionGuardada, construirTextoPrueba(nombreTienda, ancho.caracteres, etiquetaAnchoImpresora(ancho)));
      setMensajeEsError(false);
      setMensaje('Enviado a la impresora.');
    } catch (e) {
      setMensajeEsError(true);
      setMensaje(e instanceof Error ? e.message : 'No se pudo imprimir la prueba.');
    } finally {
      setProbando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas/configuracion/configuracion-impresoras" className="text-xl text-tinta/60" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Sincronizar Impresora Bluetooth</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta/60">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      <p className="mt-4 text-sm text-tinta/70">
        Imprime el comprobante de cada venta en una ticketera Bluetooth (papel de 58 u 80 mm). Primero empareja la
        impresora desde Ajustes &gt; Bluetooth del teléfono, como cualquier otro accesorio — acá solo
        se elige cuál usar.
      </p>

      {estadoPlan && !esPremium && (
        <section className="mt-6 rounded-xl border border-linea p-5 text-center">
          <p className="text-sm font-semibold text-tinta">Sincronizar Impresora Bluetooth es una función Premium</p>
          <p className="mt-2 text-xs text-tinta/60">Actívala desde el panel de administrador.</p>
        </section>
      )}

      {esPremium && (
        <>
          <section className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-linea p-4">
            <p className="text-sm font-semibold text-tinta">Activar impresión Bluetooth</p>
            <button
              type="button"
              role="switch"
              aria-checked={activa}
              onClick={alternarActiva}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                activa ? 'bg-bodega' : 'bg-linea'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-150 ${
                  activa ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </section>

          <section className="mt-6">
            <p className="text-sm font-semibold text-tinta">Impresora elegida</p>
            {direccionGuardada ? (
              <div className="mt-2 rounded-xl border border-linea bg-white px-4 py-3">
                <p className="text-sm text-tinta">{nombreGuardado}</p>
                <p className="text-xs text-tinta/40">{direccionGuardada}</p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-tinta/50">Ninguna todavía.</p>
            )}

            <button
              onClick={buscarImpresoras}
              disabled={buscando}
              className="mt-3 h-11 w-full rounded-xl border border-bodega text-sm font-semibold text-bodega disabled:opacity-40"
            >
              {buscando ? 'Buscando…' : 'Buscar impresoras emparejadas'}
            </button>

            {dispositivos.length > 0 && (
              <ul className="mt-3 divide-y divide-linea rounded-xl border border-linea">
                {dispositivos.map((d) => (
                  <li key={d.address}>
                    <button
                      onClick={() => elegirImpresora(d)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
                    >
                      <span>{d.name || 'Sin nombre'}</span>
                      <span className="text-xs text-tinta/40">{d.address}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-6">
            <p className="text-sm font-semibold text-tinta">Ancho del papel</p>
            <p className="mt-1 text-xs text-tinta/50">
              El papel de las ticketeras pequeñas es de 58 mm; el de las grandes, de 80 mm. Elige el tuyo e imprime una prueba
              para comprobarlo.
            </p>
            <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Ancho del papel">
              {(
                [
                  ['58', '58 mm'],
                  ['80', '80 mm'],
                  ['otro', 'Otro'],
                ] as const
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  role="radio"
                  aria-checked={ancho.papel === valor}
                  onClick={() => guardarAncho(valor)}
                  className={`h-11 flex-1 rounded-xl border text-sm font-semibold ${
                    ancho.papel === valor ? 'border-bodega bg-bodega text-white' : 'border-linea bg-white text-tinta'
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-tinta/50">
              {ancho.papel === 'otro'
                ? 'Caracteres por línea (según tu impresora, entre 32 y 48):'
                : `Se imprimen ${ancho.caracteres} caracteres por línea.`}
            </p>
            {ancho.papel === 'otro' && (
              <input
                value={caracteresOtro}
                onChange={(e) => setCaracteresOtro(e.target.value.replace(/\D/g, ''))}
                onBlur={() => guardarAncho('otro', caracteresOtro)}
                inputMode="numeric"
                maxLength={2}
                className="mt-2 h-11 w-full rounded-xl border border-linea px-3 text-base"
              />
            )}
            {(() => {
              const sugerido = papelSugeridoPorNombre(nombreGuardado);
              if (!sugerido || sugerido === ancho.papel) return null;
              return (
                <p className="mt-2 text-xs text-tinta/60">
                  El nombre de tu impresora parece de {sugerido} mm.{' '}
                  <button type="button" onClick={() => guardarAncho(sugerido)} className="font-semibold text-bodega-oscuro underline">
                    Usar {sugerido} mm
                  </button>
                </p>
              );
            })()}
          </section>

          {direccionGuardada && (
            <button
              onClick={imprimirPrueba}
              disabled={probando}
              className="mt-6 h-12 w-full rounded-xl bg-bodega text-sm font-semibold text-white disabled:opacity-40"
            >
              {probando ? 'Imprimiendo…' : 'Imprimir ticket de prueba'}
            </button>
          )}

          {mensaje && (
            <p className={`mt-4 text-sm ${mensajeEsError ? 'text-alerta' : 'text-bodega-oscuro'}`}>{mensaje}</p>
          )}
        </>
      )}
    </div>
  );
}
