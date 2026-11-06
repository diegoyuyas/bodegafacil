'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { usarAvisos } from '@/components/proveedor-avisos';
import { EsqueletoLista } from '@/components/ui/esqueleto';
import { AVISOS } from '@/core/avisos';
import { construirMensajeEstadoCuenta } from '@/core/estado-cuenta';
import { coincideConBusqueda } from '@/core/fiados-busqueda';
import { textoCantidad } from '@/core/ventas-semana';
import { construirDatosEstadoCuenta } from '@/infraestructura/comprobante-imagen/compartir-estado-cuenta';
import { usarPermisos } from '@/hooks/usar-permisos';
import { ErrorDeNegocio, redondear } from '@/core/reglas-negocio';
import type { Cliente, DeudaPendienteDetalle, MetodoPagoSinFiado, PagoFiado } from '@/core/tipos';
import type { EstadoPlan } from '@/core/plan';
import { construirMensajePago } from '@/core/whatsapp';
import { describirResultadoPago, montoCobrarTodo, textoMontoCampo, validarMontoPago } from '@/core/fiados-cobro';
import { construirEnlaceWhatsApp } from '@/infraestructura/whatsapp/enlace';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import { CLAVE_PREFIJO_PAIS, obtenerPrefijoPais } from '@/core/paises';
import { limpiarNumeroEscrito } from '@/core/texto';
import { ahoraLocalSql, formatearFechaHora } from '@/core/tiempo';
import { capturarFotoComprobantePago } from '@/infraestructura/comprobante-pago/capturar-foto';
import { Boton } from '@/components/ui/boton';
import { IconoWhatsApp } from '@/components/ui/iconos';
import { CampoTexto } from '@/components/ui/campo-texto';
import { Mensaje } from '@/components/ui/mensaje';
import { Monto } from '@/components/ui/monto';
import { Tarjeta } from '@/components/ui/tarjeta';
import { HojaOpciones } from '@/components/hoja-opciones';

const METODOS: { valor: MetodoPagoSinFiado; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'yape', etiqueta: 'Yape' },
  { valor: 'plin', etiqueta: 'Plin' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
];

/**
 * Fiados — pantalla simple: «Te deben S/ X», el buscador y la lista (nombre y monto). Al tocar un cliente se abre
 * un pop-up desde abajo con lo esencial: cuánto debe, «Enviar deuda por WhatsApp» (el Estado de cuenta: pedidos con
 * fecha, hora y detalle, y el saldo; si no tiene celular lo pide ahí mismo), COBRAR (monto, forma de pago) y su
 * Historial plegado (pedidos al fiado y pagos, cada pago con su «Anular»). Al final de la lista, «Historial por
 * fechas» (plegado) con el rango Desde/Hasta de todos los clientes.
 */
export default function PaginaFiados() {
  const { contenedor, cargando, error } = usarContenedor();
  const { avisar } = usarAvisos();
  const { pedirPermiso, modalPermiso } = usarPermisos(contenedor);
  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [simboloMoneda, setSimboloMoneda] = useState(obtenerSimboloMoneda(null));
  const [prefijoPais, setPrefijoPais] = useState(obtenerPrefijoPais(null));

  // Quienes deben hoy (la lista principal) y quienes tienen movimientos en el rango del historial por fechas.
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clientesRango, setClientesRango] = useState<Cliente[]>([]);
  const [datosListos, setDatosListos] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const rangoInvalido = Boolean(desde) && Boolean(hasta) && desde > hasta;

  // Cliente con el pop-up abierto.
  const [clienteAbiertoId, setClienteAbiertoId] = useState<number | null>(null);
  const [pidiendoTelefono, setPidiendoTelefono] = useState(false);
  const [telefonoNuevo, setTelefonoNuevo] = useState('');
  const [errorTelefono, setErrorTelefono] = useState<string | null>(null);
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState<MetodoPagoSinFiado>('efectivo');
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [fotoPago, setFotoPago] = useState<string | null>(null);
  const [adjuntandoFoto, setAdjuntandoFoto] = useState(false);
  const [historialClienteAbierto, setHistorialClienteAbierto] = useState(false);
  const [historialCliente, setHistorialCliente] = useState<DeudaPendienteDetalle[]>([]);
  const [pagosCliente, setPagosCliente] = useState<PagoFiado[]>([]);
  const [anulandoClave, setAnulandoClave] = useState<string | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [errorAnulacion, setErrorAnulacion] = useState<string | null>(null);

  // Último pago cobrado: se muestra arriba con el nuevo saldo y el botón para enviar el comprobante por WhatsApp.
  const [pagoReciente, setPagoReciente] = useState<{
    nombre: string;
    telefono: string | null;
    monto: number;
    metodoPago: MetodoPagoSinFiado;
    fecha: string;
    saldoNuevo: number;
    texto: string;
  } | null>(null);

  const esPremium = estadoPlan?.tipo === 'premium';
  const clienteAbierto = [...clientes, ...clientesRango].find((c) => c.id === clienteAbiertoId) ?? null;
  // El rango de fechas solo filtra el historial del cliente cuando se abrió desde «Historial por fechas».
  const filtroDesde = historialAbierto && !rangoInvalido ? desde || undefined : undefined;
  const filtroHasta = historialAbierto && !rangoInvalido ? hasta || undefined : undefined;

  function recargar() {
    if (!contenedor) return;
    setClientes(contenedor.fiados.listarClientesConDeuda());
    if (historialAbierto && !rangoInvalido) {
      setClientesRango(contenedor.fiados.listarClientesConHistorialFiado(desde || undefined, hasta || undefined));
    }
    setDatosListos(true);
  }

  useEffect(recargar, [contenedor, historialAbierto, desde, hasta, rangoInvalido]);

  useEffect(() => {
    if (!contenedor) return;
    setEstadoPlan(contenedor.plan.obtenerEstado());
    setSimboloMoneda(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
    setPrefijoPais(obtenerPrefijoPais(contenedor.configuracion.obtenerValor(CLAVE_PREFIJO_PAIS)));
  }, [contenedor]);

  // El historial y los pagos del cliente abierto se vuelven a leer al abrirlo y cada vez que cambian sus datos.
  useEffect(() => {
    if (!contenedor || clienteAbiertoId === null) return;
    setHistorialCliente(contenedor.fiados.listarHistorialFiado(clienteAbiertoId, filtroDesde, filtroHasta));
    setPagosCliente(contenedor.fiados.listarPagosDeCliente(clienteAbiertoId, filtroDesde, filtroHasta));
  }, [contenedor, clienteAbiertoId, clientes, filtroDesde, filtroHasta]);

  const deudaTotal = useMemo(() => redondear(clientes.reduce((suma, c) => suma + c.saldoPendiente, 0)), [clientes]);

  // Quien más debe, primero.
  function ordenarPorDeuda(lista: Cliente[]): Cliente[] {
    return [...lista].sort((a, b) => b.saldoPendiente - a.saldoPendiente || a.nombre.localeCompare(b.nombre));
  }
  const filasVisibles = useMemo(
    () => ordenarPorDeuda(busqueda.trim() ? clientes.filter((c) => coincideConBusqueda(c, busqueda)) : clientes),
    [busqueda, clientes],
  );
  const filasRango = useMemo(
    () => ordenarPorDeuda(busqueda.trim() ? clientesRango.filter((c) => coincideConBusqueda(c, busqueda)) : clientesRango),
    [busqueda, clientesRango],
  );

  function abrirCliente(cliente: Cliente) {
    setClienteAbiertoId(cliente.id);
    setMonto(cliente.saldoPendiente > 0 ? cliente.saldoPendiente.toFixed(2) : '');
    setMetodo('efectivo');
    setMensajeError(null);
    setFotoPago(null);
    setPidiendoTelefono(false);
    setTelefonoNuevo('');
    setErrorTelefono(null);
    setHistorialClienteAbierto(false);
    setAnulandoClave(null);
    setMotivoAnulacion('');
    setErrorAnulacion(null);
  }

  function cerrarCliente() {
    setClienteAbiertoId(null);
    setPidiendoTelefono(false);
    setAnulandoClave(null);
    setFotoPago(null);
  }

  /** Enviar deuda: el Estado de cuenta (pedidos con fecha, hora y detalle, y el saldo) por WhatsApp. */
  async function enviarMensajeDeuda(clienteId: number, telefono: string) {
    if (!contenedor) return;
    const mensaje = construirMensajeEstadoCuenta(construirDatosEstadoCuenta(contenedor, clienteId));
    // Primero se abre WhatsApp (el celular puede bloquear ventanas que se abren tras una espera).
    window.open(construirEnlaceWhatsApp(telefono, mensaje, prefijoPais), '_blank');
    try {
      contenedor.clientes.registrarRecordatorio(clienteId, ahoraLocalSql());
      await contenedor.persistir();
    } catch {
      /* si no se pudo anotar, el mensaje igual salió */
    }
  }

  function enviarDeuda(cliente: Cliente) {
    if (!cliente.telefono) {
      setPidiendoTelefono(true);
      setTelefonoNuevo('');
      setErrorTelefono(null);
      return;
    }
    void enviarMensajeDeuda(cliente.id, cliente.telefono);
  }

  async function guardarTelefonoYEnviar(cliente: Cliente) {
    if (!contenedor) return;
    setErrorTelefono(null);
    if (!(await pedirPermiso('modificar_cliente', 'guardar el teléfono del cliente'))) return;
    try {
      contenedor.clientes.guardarTelefono(cliente.id, telefonoNuevo);
      await contenedor.persistir();
      const telefonoGuardado = contenedor.clientes.obtenerPorId(cliente.id).telefono;
      setPidiendoTelefono(false);
      setTelefonoNuevo('');
      recargar();
      avisar(AVISOS.telefonoGuardado);
      if (telefonoGuardado) void enviarMensajeDeuda(cliente.id, telefonoGuardado);
    } catch (e) {
      setErrorTelefono(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar el teléfono.');
    }
  }

  async function adjuntarFotoPago() {
    setMensajeError(null);
    setAdjuntandoFoto(true);
    try {
      const ruta = await capturarFotoComprobantePago('galeria');
      if (ruta) setFotoPago(ruta);
    } catch (e) {
      setMensajeError(e instanceof Error ? e.message : 'No se pudo adjuntar la foto.');
    } finally {
      setAdjuntandoFoto(false);
    }
  }

  async function confirmarPago(cliente: Cliente) {
    if (!contenedor) return;
    setMensajeError(null);
    if (!(await pedirPermiso('registrar_pago_fiado', 'registrar el pago del fiado'))) return;
    const montoPagado = redondear(Number(monto));
    const fechaPago = ahoraLocalSql();
    try {
      contenedor.fiados.registrarPago(cliente.id, montoPagado, metodo, fotoPago);
      await contenedor.persistir();
      // Saldo real después del pago (el que quedó guardado); si no se pudiera leer, se calcula.
      let saldoActual = Math.max(0, redondear(cliente.saldoPendiente - montoPagado));
      try {
        saldoActual = contenedor.clientes.obtenerPorId(cliente.id).saldoPendiente;
      } catch {
        /* el pago ya se guardó: se usa el saldo calculado */
      }
      const resultado = describirResultadoPago(redondear(saldoActual + montoPagado), montoPagado, simboloMoneda);
      setPagoReciente({
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        monto: montoPagado,
        metodoPago: metodo,
        fecha: fechaPago,
        saldoNuevo: saldoActual,
        texto: resultado.texto,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      cerrarCliente();
      recargar();
    } catch (e) {
      setMensajeError(e instanceof ErrorDeNegocio ? e.message : 'No se pudo registrar el pago.');
    }
  }

  function enviarComprobantePagoWhatsApp() {
    if (!pagoReciente || !pagoReciente.telefono) return;
    const mensaje = construirMensajePago(
      { nombre: pagoReciente.nombre },
      {
        fecha: pagoReciente.fecha,
        monto: pagoReciente.monto,
        metodoPago: pagoReciente.metodoPago,
        saldoNuevo: pagoReciente.saldoNuevo,
      },
      simboloMoneda,
    );
    window.open(construirEnlaceWhatsApp(pagoReciente.telefono, mensaje, prefijoPais), '_blank');
  }

  async function confirmarAnulacionPago(cliente: Cliente, pago: PagoFiado) {
    if (!contenedor) return;
    setErrorAnulacion(null);
    if (motivoAnulacion.trim().length === 0) {
      setErrorAnulacion('Escribe el motivo de la anulación.');
      return;
    }
    if (!(await pedirPermiso('anular_pago_fiado', 'anular este pago de fiado'))) return;
    try {
      contenedor.fiados.anularPago(cliente.id, pago.clave, motivoAnulacion);
      await contenedor.persistir();
      setAnulandoClave(null);
      setMotivoAnulacion('');
      recargar();
      const actualizado = contenedor.clientes.obtenerPorId(cliente.id);
      setMonto(actualizado.saldoPendiente > 0 ? actualizado.saldoPendiente.toFixed(2) : '');
    } catch (e) {
      setErrorAnulacion(e instanceof ErrorDeNegocio ? e.message : 'No se pudo anular el pago.');
    }
  }

  function alternarHistorial() {
    if (historialAbierto) {
      setDesde('');
      setHasta('');
      setClientesRango([]);
    }
    setHistorialAbierto((v) => !v);
  }

  const cobrarDeshabilitado = (cliente: Cliente) =>
    !monto || Number(monto) <= 0 || validarMontoPago(monto, cliente.saldoPendiente, simboloMoneda) !== null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-24 pt-6">
      {modalPermiso}
      <header className="flex items-center gap-3">
        <Link href="/mas" className="text-xl text-tinta-suave" aria-label="Volver a Más">
          ←
        </Link>
        <h1 className="text-lg font-extrabold text-bodega-oscuro">Fiados</h1>
      </header>

      {pagoReciente && (
        <Tarjeta tono="ok" className="mt-4" role="status">
          <p className="text-sm font-bold text-ok">Pago registrado ✓</p>
          <p className="mt-1 text-sm text-tinta">
            {pagoReciente.nombre} pagó {formatearMonto(pagoReciente.monto, simboloMoneda)} · {pagoReciente.texto}
          </p>
          <div className="mt-3 flex gap-2">
            <Boton
              tamano="chico"
              anchoCompleto={false}
              className="flex-1"
              disabled={!pagoReciente.telefono || !esPremium}
              onClick={enviarComprobantePagoWhatsApp}
            >
              <IconoWhatsApp tamano={18} className="mr-2" />
              Enviar por WhatsApp
            </Boton>
            <Boton variante="secundario" tamano="chico" anchoCompleto={false} onClick={() => setPagoReciente(null)}>
              Listo
            </Boton>
          </div>
          {!esPremium ? (
            <p className="mt-2 text-xs text-tinta-suave">
              Enviar el comprobante por WhatsApp es <span className="font-semibold text-acento-oscuro">Premium</span>
            </p>
          ) : !pagoReciente.telefono ? (
            <p className="mt-2 text-xs text-tinta-suave">Este cliente no tiene teléfono registrado.</p>
          ) : null}
        </Tarjeta>
      )}

      {datosListos &&
        (clientes.length === 0 ? (
          <Tarjeta tono="ok" className="mt-4 text-center">
            <p className="text-base font-bold text-bodega-oscuro">Nadie te debe 🎉</p>
            <p className="mt-1 text-xs text-tinta-suave">Cuando vendas al fiado, aquí verás cuánto te deben.</p>
          </Tarjeta>
        ) : (
          <Tarjeta className="mt-4" role="region" aria-label="Resumen de fiados">
            <p className="text-xs font-semibold text-tinta/70">Te deben</p>
            <Monto valor={deudaTotal} simbolo={simboloMoneda} tamano="grande" className="mt-0.5" />
            <p className="mt-1 text-xs text-tinta-suave">
              {clientes.length} {clientes.length === 1 ? 'cliente' : 'clientes'}
            </p>
          </Tarjeta>
        ))}

      {clientes.length > 0 && (
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, teléfono o DNI…"
          className="mt-3 h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
        />
      )}

      <main className="mt-4 flex-1">
        {(cargando || !datosListos) && !error && <EsqueletoLista />}
        {error && <p className="text-sm text-alerta">{error.message}</p>}

        {!cargando && clientes.length > 0 && filasVisibles.length === 0 && (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta-suave">
            Ningún cliente coincide con "{busqueda}".
          </p>
        )}

        {filasVisibles.length > 0 && (
          <ul className="divide-y divide-linea border-y border-linea">
            {filasVisibles.map((cliente) => (
              <li key={cliente.id}>
                <button
                  type="button"
                  onClick={() => abrirCliente(cliente)}
                  className="flex w-full items-center justify-between gap-3 py-3 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-tinta">{cliente.nombre}</span>
                  <Monto valor={cliente.saldoPendiente} simbolo={simboloMoneda} tamano="mini" tono="alerta" />
                  <span className="shrink-0 text-tinta-suave" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {datosListos && (
          <section aria-label="Historial por fechas" className="mt-6">
            <div className="border-y border-linea py-3">
              <button
                type="button"
                onClick={alternarHistorial}
                aria-expanded={historialAbierto}
                className="flex w-full items-center justify-between text-sm font-semibold text-tinta"
              >
                <span>Historial por fechas</span>
                <span className={`text-tinta-suave transition-transform ${historialAbierto ? 'rotate-180' : ''}`} aria-hidden="true">
                  ⌄
                </span>
              </button>
              {historialAbierto && (
                <div className="mt-3">
                  <p className="text-xs text-tinta-suave">
                    Muestra los fiados y los pagos realizados dentro del rango, incluso de quienes ya pagaron todo.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-tinta-suave">Desde</label>
                      <input
                        type="date"
                        value={desde}
                        onChange={(e) => setDesde(e.target.value)}
                        max={hasta || undefined}
                        className="h-11 w-full rounded-lg border border-linea px-2 text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-tinta-suave">Hasta</label>
                      <input
                        type="date"
                        value={hasta}
                        onChange={(e) => setHasta(e.target.value)}
                        min={desde || undefined}
                        className="h-11 w-full rounded-lg border border-linea px-2 text-sm"
                      />
                    </div>
                  </div>
                  {rangoInvalido && <p className="mt-2 text-xs text-alerta">La fecha "desde" no puede ser posterior a "hasta".</p>}
                  {!rangoInvalido && clientesRango.length === 0 && (
                    <p className="mt-3 text-center text-sm text-tinta-suave">No hay fiados ni pagos en este rango.</p>
                  )}
                  {!rangoInvalido && filasRango.length > 0 && (
                    <ul className="mt-3 divide-y divide-linea">
                      {filasRango.map((cliente) => (
                        <li key={cliente.id}>
                          <button
                            type="button"
                            onClick={() => abrirCliente(cliente)}
                            className="flex w-full items-center justify-between gap-3 py-3 text-left"
                          >
                            <span className="min-w-0 flex-1 truncate text-sm text-tinta">{cliente.nombre}</span>
                            {cliente.saldoPendiente > 0 ? (
                              <Monto valor={cliente.saldoPendiente} simbolo={simboloMoneda} tamano="mini" tono="alerta" />
                            ) : (
                              <span className="text-sm font-semibold text-ok">Pagado</span>
                            )}
                            <span className="shrink-0 text-tinta-suave" aria-hidden="true">
                              ›
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {clienteAbierto && (
        <HojaOpciones
          titulo={clienteAbierto.nombre}
          subtitulo={clienteAbierto.telefono ?? 'Sin teléfono'}
          onCerrar={cerrarCliente}
        >
          <div className="space-y-4">
            <div>
              <p className="text-xs text-tinta-suave">Debe</p>
              {clienteAbierto.saldoPendiente > 0 ? (
                <Monto valor={clienteAbierto.saldoPendiente} simbolo={simboloMoneda} tamano="grande" tono="alerta" />
              ) : (
                <p className="text-lg font-extrabold text-ok">Pagado</p>
              )}
            </div>

            {clienteAbierto.saldoPendiente > 0 && (
              <div className="space-y-2">
                {pidiendoTelefono ? (
                  <div className="space-y-2 rounded-xl border border-linea p-3">
                    <CampoTexto
                      label={`Celular de ${clienteAbierto.nombre}`}
                      value={telefonoNuevo}
                      onChange={(e) => {
                        setTelefonoNuevo(e.target.value);
                        setErrorTelefono(null);
                      }}
                      inputMode="tel"
                      placeholder="987 654 321"
                      error={errorTelefono}
                    />
                    <div className="flex gap-2">
                      <Boton
                        tamano="chico"
                        anchoCompleto={false}
                        className="flex-1"
                        disabled={!telefonoNuevo.trim()}
                        onClick={() => guardarTelefonoYEnviar(clienteAbierto)}
                      >
                        Guardar y enviar
                      </Boton>
                      <Boton variante="secundario" tamano="chico" anchoCompleto={false} onClick={() => setPidiendoTelefono(false)}>
                        Cancelar
                      </Boton>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => enviarDeuda(clienteAbierto)}
                    disabled={!esPremium}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#25D366] bg-white text-sm font-semibold text-tinta disabled:opacity-40"
                  >
                    <IconoWhatsApp tamano={22} className="text-[#25D366]" />
                    Enviar deuda por WhatsApp
                  </button>
                )}
                {!esPremium && (
                  <p className="text-xs text-tinta-suave">
                    Enviar por WhatsApp es <span className="font-semibold text-acento-oscuro">Premium</span>
                  </p>
                )}
              </div>
            )}

            {clienteAbierto.saldoPendiente > 0 && (
              <div className="space-y-3 border-t border-linea pt-3">
                <p className="text-xs font-semibold text-tinta/70">Cobrar</p>
                <CampoTexto
                  label="Monto del pago"
                  value={monto}
                  onChange={(e) => setMonto(limpiarNumeroEscrito(e.target.value))}
                  inputMode="decimal"
                  placeholder="0.00"
                  error={validarMontoPago(monto, clienteAbierto.saldoPendiente, simboloMoneda)}
                />
                <Boton
                  variante="suave"
                  tamano="chico"
                  anchoCompleto={false}
                  onClick={() => setMonto(textoMontoCampo(montoCobrarTodo(clienteAbierto.saldoPendiente)))}
                >
                  Cobrar todo
                </Boton>
                <div className="flex flex-wrap gap-2">
                  {METODOS.map((m) => (
                    <button
                      key={m.valor}
                      type="button"
                      onClick={() => {
                        setMetodo(m.valor);
                        if (m.valor !== 'yape' && m.valor !== 'plin') setFotoPago(null);
                      }}
                      className={`h-8 rounded-full border px-3 text-xs font-medium ${
                        metodo === m.valor ? 'border-bodega bg-bodega text-white' : 'border-linea text-tinta/70'
                      }`}
                    >
                      {m.etiqueta}
                    </button>
                  ))}
                </div>

                {(metodo === 'yape' || metodo === 'plin') && (
                  <div>
                    {!esPremium ? (
                      <p className="text-xs text-tinta-suave">
                        Adjuntar foto del pago <span className="font-semibold text-acento-oscuro">Premium</span>
                      </p>
                    ) : fotoPago ? (
                      <div className="flex items-center justify-between rounded-lg border border-linea px-3 py-2 text-xs">
                        <span className="text-tinta/70">Foto del pago adjuntada</span>
                        <button type="button" onClick={() => setFotoPago(null)} className="font-semibold text-alerta">
                          Quitar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={adjuntarFotoPago}
                        disabled={adjuntandoFoto}
                        className="h-9 w-full rounded-lg border border-linea text-xs font-semibold text-bodega-oscuro disabled:opacity-50"
                      >
                        {adjuntandoFoto ? 'Abriendo galería…' : 'Adjuntar foto del pago (opcional)'}
                      </button>
                    )}
                  </div>
                )}

                {mensajeError && <Mensaje tipo="error">{mensajeError}</Mensaje>}
                <Boton tamano="chico" onClick={() => confirmarPago(clienteAbierto)} disabled={cobrarDeshabilitado(clienteAbierto)}>
                  Registrar pago
                </Boton>
              </div>
            )}

            <div className="border-t border-linea pt-3">
              <button
                type="button"
                onClick={() => setHistorialClienteAbierto((v) => !v)}
                aria-expanded={historialClienteAbierto}
                className="flex w-full items-center justify-between text-sm font-semibold text-tinta"
              >
                <span>Historial</span>
                <span
                  className={`text-tinta-suave transition-transform ${historialClienteAbierto ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                >
                  ⌄
                </span>
              </button>

              {historialClienteAbierto && (
                <div className="mt-3 space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-tinta/70">Pedidos al fiado</p>
                    {historialCliente.length === 0 ? (
                      <p className="mt-1 text-xs text-tinta-suave">Sin ventas al fiado registradas.</p>
                    ) : (
                      <ul className="mt-1 space-y-1.5">
                        {historialCliente.map((venta, indice) => {
                          const pagada = venta.saldoPendiente <= 0;
                          const anulada = venta.ventaAnulada === true;
                          return (
                            <li key={venta.ventaId ?? `d${indice}`} className="text-xs text-tinta/80">
                              <div className="flex items-center justify-between">
                                <span>
                                  {venta.ventaId ? `V-${venta.ventaId}` : 'Deuda'} · {formatearFechaHora(venta.fecha)}
                                </span>
                                <span className={`font-semibold ${anulada ? 'text-tinta-suave' : pagada ? 'text-ok' : 'text-alerta'}`}>
                                  {anulada
                                    ? 'Venta anulada'
                                    : pagada
                                      ? 'Pagado'
                                      : `Debe ${formatearMonto(venta.saldoPendiente, simboloMoneda)}`}
                                </span>
                              </div>
                              {venta.lineas.length > 0 && (
                                <p className="text-tinta-suave">
                                  {venta.lineas.map((l) => `${textoCantidad(l.cantidad)} ${l.producto}`).join(', ')}
                                </p>
                              )}
                              <p className="text-tinta-suave">
                                {anulada
                                  ? `Era de ${formatearMonto(venta.montoOriginal, simboloMoneda)}`
                                  : !pagada && venta.saldoPendiente < venta.montoOriginal
                                    ? `De ${formatearMonto(venta.montoOriginal, simboloMoneda)}, ya abonó ${formatearMonto(venta.montoOriginal - venta.saldoPendiente, simboloMoneda)}`
                                    : `Total ${formatearMonto(venta.montoOriginal, simboloMoneda)}`}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  <div className="border-t border-linea pt-3">
                    <p className="text-xs font-semibold text-tinta/70">Pagos realizados</p>
                    {pagosCliente.length === 0 ? (
                      <p className="mt-1 text-xs text-tinta-suave">Sin pagos registrados.</p>
                    ) : (
                      <ul className="mt-1 space-y-2">
                        {pagosCliente.map((pago) => (
                          <li key={pago.clave} className="text-xs text-tinta/80">
                            <div className="flex items-center justify-between gap-2">
                              <span className={pago.anulado ? 'text-tinta-suave line-through' : ''}>
                                {formatearFechaHora(pago.fecha)} · {pago.metodoPago}
                                {pago.ventas.length > 0 && ` · ${pago.ventas.map((id) => `V-${id}`).join(', ')}`}
                              </span>
                              <span className={`font-semibold ${pago.anulado ? 'text-tinta-suave line-through' : 'text-bodega-oscuro'}`}>
                                {formatearMonto(pago.monto, simboloMoneda)}
                              </span>
                            </div>

                            {pago.anulado ? (
                              <p className="text-alerta">
                                Anulado{pago.fechaAnulacion ? ` el ${formatearFechaHora(pago.fechaAnulacion)}` : ''}
                                {pago.motivoAnulacion ? ` — ${pago.motivoAnulacion}` : ''}
                              </p>
                            ) : anulandoClave === pago.clave ? (
                              <div className="mt-1.5 space-y-2 rounded-lg border border-alerta/40 p-2">
                                <p className="text-tinta/70">
                                  Se reabrirá la deuda por {formatearMonto(pago.monto, simboloMoneda)} y se registrará un egreso en Caja.
                                </p>
                                <input
                                  value={motivoAnulacion}
                                  onChange={(e) => {
                                    setMotivoAnulacion(e.target.value);
                                    setErrorAnulacion(null);
                                  }}
                                  placeholder="Motivo de la anulación (obligatorio)"
                                  className="h-9 w-full rounded-lg border border-linea px-3 text-xs"
                                />
                                {errorAnulacion && <p className="text-alerta">{errorAnulacion}</p>}
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAnulandoClave(null);
                                      setMotivoAnulacion('');
                                      setErrorAnulacion(null);
                                    }}
                                    className="h-9 flex-1 rounded-lg border border-linea text-xs font-semibold text-tinta/70"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => confirmarAnulacionPago(clienteAbierto, pago)}
                                    disabled={motivoAnulacion.trim().length === 0}
                                    className="h-9 flex-1 rounded-lg border border-alerta text-xs font-semibold text-alerta disabled:opacity-40"
                                  >
                                    Anular pago
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setAnulandoClave(pago.clave);
                                  setMotivoAnulacion('');
                                  setErrorAnulacion(null);
                                }}
                                className="mt-0.5 font-semibold text-alerta"
                              >
                                Anular
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </HojaOpciones>
      )}
    </div>
  );
}
