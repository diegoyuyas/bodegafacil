'use client';

import Link from 'next/link';
import { useEffect, useState, type ChangeEvent } from 'react';
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
  CLAVE_TIENDA_VENDEDOR,
  CLAVE_TIENDA_VENDEDOR_DOCUMENTO,
  LONGITUD_MAXIMA_CONTACTO,
  LONGITUD_MAXIMA_LEYENDA,
  LONGITUD_MAXIMA_UBICACION,
  LONGITUD_MAXIMA_VENDEDOR,
  LONGITUD_MAXIMA_VENDEDOR_DOCUMENTO,
} from '@/core/informacion-tienda';
import { ErrorDeNegocio, validarRuc } from '@/core/reglas-negocio';
import {
  CLAVE_LOGO_DATOS,
  CLAVE_LOGO_EN_IMAGEN,
  LOGO_ALTO_MAXIMO,
  LOGO_ANCHO_MAXIMO,
  esLogoValido,
  logoEnImagenActivo,
} from '@/core/logo';
import { procesarArchivoLogo } from '@/infraestructura/logo/procesar-logo';
import {
  CLAVE_LOGO_EN_TICKET,
  CLAVE_LOGO_ESTILO_TICKET,
  estiloLogoImpresion,
  logoEnTicketActivo,
  puntosDePapel,
  type EstiloLogoImpresion,
} from '@/core/logo-impresion';
import {
  CLAVE_IMPRESORA_CARACTERES,
  CLAVE_IMPRESORA_DIRECCION,
  CLAVE_IMPRESORA_PAPEL,
  etiquetaAnchoImpresora,
  leerAnchoImpresora,
} from '@/core/impresora';
import { construirTextoPruebaLogo } from '@/core/comprobante-prueba';
import { prepararLogoParaImpresion, vistaPreviaEnBlancoYNegro } from '@/infraestructura/logo/preparar-logo-impresion';
import { imprimirEn } from '@/infraestructura/impresora-bluetooth/impresora';

export default function PaginaInformacionNegocio() {
  const { contenedor, cargando, error } = usarContenedor();

  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [nombreTienda, setNombreTienda] = useState('');
  const [documento, setDocumento] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [contacto, setContacto] = useState('');
  const [leyenda, setLeyenda] = useState('');
  const [nombreVendedor, setNombreVendedor] = useState('');
  const [documentoVendedor, setDocumentoVendedor] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [logoEnImagen, setLogoEnImagen] = useState(true);
  const [procesandoLogo, setProcesandoLogo] = useState(false);
  const [logoEnTicket, setLogoEnTicket] = useState(true);
  const [estiloLogo, setEstiloLogo] = useState<EstiloLogoImpresion>('nitido');
  const [vistaPreviaBn, setVistaPreviaBn] = useState<string | null>(null);
  const [imprimiendoPrueba, setImprimiendoPrueba] = useState(false);
  const [mensajeLogo, setMensajeLogo] = useState<string | null>(null);
  const [mensajeLogoEsError, setMensajeLogoEsError] = useState(false);

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
    setNombreVendedor(c.obtenerValor(CLAVE_TIENDA_VENDEDOR) ?? '');
    setDocumentoVendedor(c.obtenerValor(CLAVE_TIENDA_VENDEDOR_DOCUMENTO) ?? '');
    const logoGuardado = c.obtenerValor(CLAVE_LOGO_DATOS);
    setLogo(esLogoValido(logoGuardado) ? logoGuardado : null);
    setLogoEnImagen(logoEnImagenActivo(c.obtenerValor(CLAVE_LOGO_EN_IMAGEN)));
    setLogoEnTicket(logoEnTicketActivo(c.obtenerValor(CLAVE_LOGO_EN_TICKET)));
    setEstiloLogo(estiloLogoImpresion(c.obtenerValor(CLAVE_LOGO_ESTILO_TICKET)));
  }, [contenedor]);

  /** El ancho de papel elegido en Sincronizar Impresora Bluetooth (58 mm por defecto). */
  const anchoPapel = contenedor
    ? leerAnchoImpresora(
        contenedor.configuracion.obtenerValor(CLAVE_IMPRESORA_PAPEL),
        contenedor.configuracion.obtenerValor(CLAVE_IMPRESORA_CARACTERES),
      )
    : leerAnchoImpresora(null, null);

  // Vista previa en blanco y negro: se rehace al cambiar el logotipo, el estilo o el ancho de papel.
  useEffect(() => {
    if (!logo) {
      setVistaPreviaBn(null);
      return;
    }
    let vigente = true;
    vistaPreviaEnBlancoYNegro(logo, anchoPapel, estiloLogo)
      .then((url) => vigente && setVistaPreviaBn(url))
      .catch(() => vigente && setVistaPreviaBn(null));
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logo, estiloLogo, anchoPapel.papel, anchoPapel.caracteres]);

  const esPremium = estadoPlan?.tipo === 'premium';

  function establecerOEliminar(clave: string, valor: string) {
    if (!contenedor) return;
    const limpio = valor.trim();
    if (limpio) contenedor.configuracion.establecerValor(clave, limpio);
    else contenedor.configuracion.eliminarValor(clave);
  }

  /** El logotipo se guarda apenas se elige (no espera al botón «Guardar información»). */
  async function elegirLogo(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = ''; // para poder elegir de nuevo el mismo archivo
    if (!archivo || !contenedor || !esPremium) return;
    setMensajeLogo(null);
    setProcesandoLogo(true);
    try {
      const datos = await procesarArchivoLogo(archivo);
      contenedor.configuracion.establecerValor(CLAVE_LOGO_DATOS, datos);
      await contenedor.persistir();
      setLogo(datos);
      setMensajeLogoEsError(false);
      setMensajeLogo('Logotipo guardado.');
    } catch (e) {
      setMensajeLogoEsError(true);
      setMensajeLogo(e instanceof ErrorDeNegocio ? e.message : 'No se pudo usar esa imagen. Prueba con otra.');
    } finally {
      setProcesandoLogo(false);
    }
  }

  async function quitarLogo() {
    if (!contenedor || !esPremium) return;
    contenedor.configuracion.eliminarValor(CLAVE_LOGO_DATOS);
    await contenedor.persistir();
    setLogo(null);
    setMensajeLogoEsError(false);
    setMensajeLogo('Logotipo quitado.');
  }

  async function alternarLogoEnImagen() {
    if (!contenedor || !esPremium) return;
    const nuevo = !logoEnImagen;
    setLogoEnImagen(nuevo);
    contenedor.configuracion.establecerValor(CLAVE_LOGO_EN_IMAGEN, nuevo ? '1' : '0');
    await contenedor.persistir();
  }

  async function alternarLogoEnTicket() {
    if (!contenedor || !esPremium) return;
    const nuevo = !logoEnTicket;
    setLogoEnTicket(nuevo);
    contenedor.configuracion.establecerValor(CLAVE_LOGO_EN_TICKET, nuevo ? '1' : '0');
    await contenedor.persistir();
  }

  async function elegirEstiloLogo(estilo: EstiloLogoImpresion) {
    if (!contenedor || !esPremium) return;
    setEstiloLogo(estilo);
    contenedor.configuracion.establecerValor(CLAVE_LOGO_ESTILO_TICKET, estilo);
    await contenedor.persistir();
  }

  /** Imprime SOLO el logotipo en la ticketera elegida, para ver cómo sale antes de usarlo en las ventas. */
  async function imprimirPruebaLogo() {
    if (!contenedor || !esPremium || !logo) return;
    setMensajeLogo(null);
    const direccion = contenedor.configuracion.obtenerValor(CLAVE_IMPRESORA_DIRECCION);
    if (!direccion) {
      setMensajeLogoEsError(true);
      setMensajeLogo('Primero elige tu impresora en Más > Configuración > Configuración de Impresión > Sincronizar Impresora Bluetooth.');
      return;
    }
    setImprimiendoPrueba(true);
    try {
      const comandos = await prepararLogoParaImpresion(logo, anchoPapel, estiloLogo);
      await imprimirEn(direccion, construirTextoPruebaLogo(comandos));
      setMensajeLogoEsError(false);
      setMensajeLogo('Enviado a la impresora. Revisa cómo salió el logotipo.');
    } catch (e) {
      setMensajeLogoEsError(true);
      setMensajeLogo(e instanceof Error ? e.message : 'No se pudo imprimir la prueba del logotipo.');
    } finally {
      setImprimiendoPrueba(false);
    }
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
    establecerOEliminar(CLAVE_TIENDA_VENDEDOR, nombreVendedor);
    establecerOEliminar(CLAVE_TIENDA_VENDEDOR_DOCUMENTO, documentoVendedor);
    await contenedor.persistir();
    setNombreTienda((v) => v.trim() || NOMBRE_TIENDA_PREDETERMINADO);
    setGuardando(false);
    setMensaje('Información guardada.');
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/mas/configuracion" className="text-xl text-tinta-suave" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Información del Negocio</h1>
      </header>

      {cargando && <p className="mt-4 text-sm text-tinta-suave">Cargando…</p>}
      {error && <p className="mt-4 text-sm text-alerta">{error.message}</p>}

      <p className="mt-4 text-sm text-tinta/70">
        Estos datos aparecen en Inicio y en el comprobante impreso (Más &gt; Configuración de
        Impresoras).
      </p>

      {estadoPlan && !esPremium && (
        <section className="mt-6 rounded-xl border border-linea p-5 text-center">
          <p className="text-sm font-semibold text-tinta">Información del Negocio es una función Premium</p>
          <p className="mt-2 text-xs text-tinta-suave">Actívala desde el panel de administrador.</p>
        </section>
      )}

      {esPremium && (
        <>
          <section className="mt-6">
            <p className="text-sm font-semibold text-tinta">Nombre del negocio</p>
            <p className="mt-0.5 text-xs text-tinta-suave">
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
            <p className="text-sm font-semibold text-tinta">Logotipo</p>
            <p className="mt-0.5 text-xs text-tinta-suave">
              Aparece arriba en la imagen del ticket que compartes y en el ticket de la ticketera. Se reduce solo (máximo {LOGO_ANCHO_MAXIMO} × {LOGO_ALTO_MAXIMO} px) y se
              le pone fondo blanco. Formatos: JPG, PNG o WebP.
            </p>

            {logo && (
              <div className="mt-3 flex justify-center rounded-xl border border-linea bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt="Logotipo del negocio" className="max-h-32 max-w-full object-contain" />
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <label
                className={`flex h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-bodega text-sm font-semibold text-bodega ${
                  procesandoLogo ? 'opacity-40' : ''
                }`}
              >
                {procesandoLogo ? 'Preparando…' : logo ? 'Cambiar logotipo' : 'Elegir logotipo'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={elegirLogo}
                  disabled={procesandoLogo}
                  className="hidden"
                />
              </label>
              {logo && (
                <button
                  type="button"
                  onClick={quitarLogo}
                  className="h-11 rounded-xl border border-linea px-4 text-sm font-semibold text-tinta"
                >
                  Quitar
                </button>
              )}
            </div>

            {logo && (
              <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-linea p-4">
                <p className="text-sm text-tinta">Mostrar en la imagen del ticket</p>
                <button
                  type="button"
                  role="switch"
                  aria-checked={logoEnImagen}
                  aria-label="Mostrar el logotipo en la imagen del ticket"
                  onClick={alternarLogoEnImagen}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${logoEnImagen ? 'bg-bodega' : 'bg-linea'}`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-150 ${
                      logoEnImagen ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            )}

            {logo && (
              <div className="mt-3 rounded-xl border border-linea p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-tinta">Imprimir en la ticketera</p>
                    <p className="mt-0.5 text-xs text-tinta-suave">
                      Sale arriba del ticket, en blanco y negro y centrado (papel {etiquetaAnchoImpresora(anchoPapel)}).
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={logoEnTicket}
                    aria-label="Imprimir el logotipo en la ticketera"
                    onClick={alternarLogoEnTicket}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${logoEnTicket ? 'bg-bodega' : 'bg-linea'}`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-150 ${
                        logoEnTicket ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {logoEnTicket && (
                  <>
                    <div className="mt-3 flex gap-2" role="radiogroup" aria-label="Estilo del logotipo en papel">
                      {(
                        [
                          ['nitido', 'Nítido (logotipos)'],
                          ['sombras', 'Con sombras (fotos)'],
                        ] as const
                      ).map(([valor, etiqueta]) => (
                        <button
                          key={valor}
                          type="button"
                          role="radio"
                          aria-checked={estiloLogo === valor}
                          onClick={() => elegirEstiloLogo(valor)}
                          className={`h-10 flex-1 rounded-xl border text-xs font-semibold ${
                            estiloLogo === valor ? 'border-bodega bg-bodega text-white' : 'border-linea bg-white text-tinta'
                          }`}
                        >
                          {etiqueta}
                        </button>
                      ))}
                    </div>

                    {vistaPreviaBn && (
                      <div className="mt-3">
                        <p className="text-xs text-tinta-suave">Así saldrá en el papel ({puntosDePapel(anchoPapel)} puntos de ancho):</p>
                        <div className="mt-1 flex justify-center rounded-xl border border-linea bg-white p-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={vistaPreviaBn}
                            alt="Vista previa del logotipo en blanco y negro"
                            style={{ imageRendering: 'pixelated' }}
                            className="max-h-32 max-w-full object-contain"
                          />
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={imprimirPruebaLogo}
                      disabled={imprimiendoPrueba}
                      className="mt-3 h-11 w-full rounded-xl border border-bodega text-sm font-semibold text-bodega disabled:opacity-40"
                    >
                      {imprimiendoPrueba ? 'Imprimiendo…' : 'Imprimir prueba del logotipo'}
                    </button>
                    <p className="mt-2 text-xs text-tinta-suave">
                      Imprime la prueba antes de usarlo en las ventas: algunas ticketeras económicas muestran el logotipo con
                      finas líneas o no lo imprimen. Si te pasa, apaga este interruptor y el ticket sale solo con texto.
                    </p>
                  </>
                )}
              </div>
            )}

            {mensajeLogo && (
              <p className={`mt-2 text-sm ${mensajeLogoEsError ? 'text-alerta' : 'text-bodega-oscuro'}`}>{mensajeLogo}</p>
            )}
          </section>

          <section className="mt-6">
            <p className="text-sm font-semibold text-tinta">DNI o RUC</p>
            <p className="mt-0.5 text-xs text-tinta-suave">No obligatorio.</p>
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
            <p className="mt-0.5 text-xs text-tinta-suave">No obligatorio — hasta {LONGITUD_MAXIMA_UBICACION} caracteres.</p>
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
            <p className="mt-0.5 text-xs text-tinta-suave">No obligatorio — hasta {LONGITUD_MAXIMA_CONTACTO} caracteres.</p>
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
            <p className="mt-0.5 text-xs text-tinta-suave">
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

          <section className="mt-6">
            <p className="text-sm font-semibold text-tinta">Nombre del vendedor</p>
            <p className="mt-0.5 text-xs text-tinta-suave">
              No obligatorio — aparece en la nota de venta, entre la fecha y el cliente. Hasta{' '}
              {LONGITUD_MAXIMA_VENDEDOR} caracteres.
            </p>
            <input
              value={nombreVendedor}
              onChange={(e) => setNombreVendedor(e.target.value.slice(0, LONGITUD_MAXIMA_VENDEDOR))}
              placeholder="Ej. Juan Pérez"
              maxLength={LONGITUD_MAXIMA_VENDEDOR}
              className="mt-2 h-11 w-full rounded-xl border border-linea px-3 text-sm"
            />
          </section>

          <section className="mt-6">
            <p className="text-sm font-semibold text-tinta">N° Doc. Vendedor</p>
            <p className="mt-0.5 text-xs text-tinta-suave">
              No obligatorio — no se imprime en la nota de venta, solo aparece en el reporte de
              ventas. Hasta {LONGITUD_MAXIMA_VENDEDOR_DOCUMENTO} caracteres.
            </p>
            <input
              value={documentoVendedor}
              onChange={(e) =>
                setDocumentoVendedor(e.target.value.slice(0, LONGITUD_MAXIMA_VENDEDOR_DOCUMENTO))
              }
              placeholder="Ej. 12345678"
              maxLength={LONGITUD_MAXIMA_VENDEDOR_DOCUMENTO}
              className="mt-2 h-11 w-full rounded-xl border border-linea px-3 text-sm"
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
