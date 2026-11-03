'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { usarAvisos } from '@/components/proveedor-avisos';
import { EsqueletoLista } from '@/components/ui/esqueleto';
import { AVISOS } from '@/core/avisos';
import { construirEstadoCuenta, construirMensajeEstadoCuenta, type EstadoCuenta } from '@/core/estado-cuenta';
import { coincideConBusqueda } from '@/core/fiados-busqueda';
import { textoCantidad } from '@/core/ventas-semana';
import { compartirEstadoCuentaImagen, construirDatosEstadoCuenta } from '@/infraestructura/comprobante-imagen/compartir-estado-cuenta';
import { usarPermisos } from '@/hooks/usar-permisos';
import { ErrorDeNegocio, redondear } from '@/core/reglas-negocio';
import type { Cliente, DeudaClienteItem, DeudaPendienteDetalle, MetodoPagoSinFiado, PagoFiado } from '@/core/tipos';
import {
  DIAS_VENCIDO_FIADO,
  ORDENES_FIADOS,
  calcularResumenFiados,
  construirFilasFiado,
  filtrarSoloVencidos,
  nivelAntiguedad,
  ordenarFilasFiado,
  textoAntiguedad,
  type NivelAntiguedad,
  type OrdenFiados,
} from '@/core/fiados-resumen';
import type { EstadoPlan } from '@/core/plan';
import { construirMensajeDeuda, construirMensajePago } from '@/core/whatsapp';
import {
  describirResultadoPago,
  montoCobrarTodo,
  montoPagarMitad,
  textoMontoCampo,
  validarMontoPago,
} from '@/core/fiados-cobro';
import { textoRecordado } from '@/core/fiados-recordatorio';
import {
  atajosCompromiso,
  compromisoVigente,
  estadoCompromiso,
  filtrarCompromisosVencidos,
  textoCompromiso,
} from '@/core/fiados-compromiso';
import { construirEnlaceWhatsApp } from '@/infraestructura/whatsapp/enlace';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import { CLAVE_PREFIJO_PAIS, obtenerPrefijoPais } from '@/core/paises';
import { limpiarNumeroEscrito } from '@/core/texto';
import { ahoraLocalSql, formatearFechaHora, hoyLocalSql } from '@/core/tiempo';
import { capturarFotoComprobantePago } from '@/infraestructura/comprobante-pago/capturar-foto';
import { Boton } from '@/components/ui/boton';
import { IconoWhatsApp } from '@/components/ui/iconos';
import { CampoTexto } from '@/components/ui/campo-texto';
import { Mensaje } from '@/components/ui/mensaje';
import { Monto } from '@/components/ui/monto';
import { Tarjeta } from '@/components/ui/tarjeta';

const METODOS: { valor: MetodoPagoSinFiado; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'yape', etiqueta: 'Yape' },
  { valor: 'plin', etiqueta: 'Plin' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
];

// Gris = normal, dorado = desde 15 días, rojo = vencido (más de 30 días).
const CLASE_ANTIGUEDAD: Record<NivelAntiguedad, string> = {
  normal: 'text-tinta-suave',
  aviso: 'text-acento-oscuro',
  vencido: 'text-alerta',
};

export default function PaginaFiados() {
  const { contenedor, cargando, error } = usarContenedor();
  const { avisar, vibrar } = usarAvisos();
  const { pedirPermiso, modalPermiso } = usarPermisos(contenedor);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [simboloMoneda, setSimboloMoneda] = useState(obtenerSimboloMoneda(null));
  const [prefijoPais, setPrefijoPais] = useState(obtenerPrefijoPais(null));
  const [clienteAbierto, setClienteAbierto] = useState<number | null>(null);
  // Cliente al que se le está agregando el teléfono en el momento (para poder recordarle su deuda).
  const [editandoTelefonoId, setEditandoTelefonoId] = useState<number | null>(null);
  const [telefonoNuevo, setTelefonoNuevo] = useState('');
  const [errorTelefono, setErrorTelefono] = useState<string | null>(null);
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState<MetodoPagoSinFiado>('efectivo');
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  // TODAS las ventas al fiado del cliente que tiene abierto el detalle,
  // pagadas o no (para el historial que se despliega al tocar su nombre).
  const [historialCliente, setHistorialCliente] = useState<DeudaPendienteDetalle[]>([]);
  // Pagos (abonos) del cliente abierto, para poder anularlos.
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
  // Foto (Yape/Plin) que se va a adjuntar al pago que se está registrando.
  const [fotoPago, setFotoPago] = useState<string | null>(null);
  const [adjuntandoFoto, setAdjuntandoFoto] = useState(false);

  // Buscador (nombre, DNI o monto de deuda). Por defecto la lista muestra a TODOS los
  // que deben hoy (sin importar cuándo fiaron). El rango de fechas queda oculto: al
  // abrirlo ("Ver historial por fechas") la lista incluye también a quienes ya pagaron.
  const [busqueda, setBusqueda] = useState('');
  const [mostrarFechas, setMostrarFechas] = useState(false);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const rangoInvalido = Boolean(desde) && Boolean(hasta) && desde > hasta;

  // Resumen de arriba: siempre sobre TODOS los que deben (no depende del rango ni del buscador).
  const [deudores, setDeudores] = useState<Cliente[]>([]);
  const [antiguedad, setAntiguedad] = useState<DeudaClienteItem[]>([]);
  const [datosListos, setDatosListos] = useState(false);
  const [orden, setOrden] = useState<OrdenFiados>('mayor_deuda');
  const [soloVencidos, setSoloVencidos] = useState(false);
  const [soloCompromisosVencidos, setSoloCompromisosVencidos] = useState(false);
  // Ficha del cliente abierto: totales con TODO su historial (no solo el rango de fechas) y estado de cuenta.
  const [estadoCuentaAbierto, setEstadoCuentaAbierto] = useState<EstadoCuenta | null>(null);
  const [generandoEstado, setGenerandoEstado] = useState(false);
  const [errorCompromiso, setErrorCompromiso] = useState<{ clienteId: number; texto: string } | null>(null);

  function recargar() {
    if (!contenedor || rangoInvalido) return;
    setClientes(
      mostrarFechas
        ? contenedor.fiados.listarClientesConHistorialFiado(desde || undefined, hasta || undefined)
        : contenedor.fiados.listarClientesConDeuda(),
    );
    setDeudores(contenedor.fiados.listarClientesConDeuda());
    setAntiguedad(contenedor.fiados.listarDeudasPorAntiguedad(hoyLocalSql()));
    setDatosListos(true);
  }

  useEffect(recargar, [contenedor, mostrarFechas, desde, hasta, rangoInvalido]);

  // Si hay un cliente con el detalle abierto, su historial y sus pagos se vuelven a leer
  // cada vez que cambia el rango de fechas (antes solo se leían al abrir el detalle).
  useEffect(() => {
    if (!contenedor || clienteAbierto === null || rangoInvalido) return;
    setHistorialCliente(contenedor.fiados.listarHistorialFiado(clienteAbierto, desde || undefined, hasta || undefined));
    setPagosCliente(contenedor.fiados.listarPagosDeCliente(clienteAbierto, desde || undefined, hasta || undefined));
  }, [contenedor, clienteAbierto, desde, hasta, rangoInvalido]);

  // Si el cliente abierto ya no entra en el rango elegido, se cierra su detalle.
  useEffect(() => {
    if (clienteAbierto !== null && !rangoInvalido && !clientes.some((c) => c.id === clienteAbierto)) {
      setClienteAbierto(null);
    }
  }, [clientes, clienteAbierto, rangoInvalido]);
  useEffect(() => {
    if (!contenedor) return;
    setEstadoPlan(contenedor.plan.obtenerEstado());
    setSimboloMoneda(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
    setPrefijoPais(obtenerPrefijoPais(contenedor.configuracion.obtenerValor(CLAVE_PREFIJO_PAIS)));
  }, [contenedor]);

const esPremium = estadoPlan?.tipo === 'premium';

  const clientesFiltrados = useMemo(() => {
    if (!busqueda.trim()) return clientes;
    return clientes.filter((c) => coincideConBusqueda(c, busqueda));
  }, [busqueda, clientes]);

  // La ficha del cliente abierto se vuelve a armar al abrirlo y cada vez que cambian sus datos (un pago, por ejemplo).
  useEffect(() => {
    if (!contenedor || clienteAbierto === null) {
      setEstadoCuentaAbierto(null);
      return;
    }
    const cliente = clientes.find((c) => c.id === clienteAbierto);
    if (!cliente) return;
    setEstadoCuentaAbierto(
      construirEstadoCuenta(
        cliente,
        contenedor.fiados.listarHistorialFiado(cliente.id),
        contenedor.fiados.listarPagosDeCliente(cliente.id),
      ),
    );
  }, [contenedor, clienteAbierto, clientes]);

  const resumen = useMemo(() => calcularResumenFiados(deudores, antiguedad), [deudores, antiguedad]);
  const hoy = hoyLocalSql();

  const filasVisibles = useMemo(() => {
    let filas = construirFilasFiado(clientesFiltrados, antiguedad);
    if (soloVencidos) filas = filtrarSoloVencidos(filas);
    if (soloCompromisosVencidos) filas = filtrarCompromisosVencidos(filas, hoy);
    return ordenarFilasFiado(filas, orden);
  }, [clientesFiltrados, antiguedad, soloVencidos, soloCompromisosVencidos, hoy, orden]);

  const atajos = atajosCompromiso(hoy);

  function alternarCliente(cliente: Cliente) {
    if (clienteAbierto === cliente.id) {
      setClienteAbierto(null);
      return;
    }
    setClienteAbierto(cliente.id);
    setMonto(cliente.saldoPendiente > 0 ? cliente.saldoPendiente.toFixed(2) : '');
    setMensajeError(null);
    setFotoPago(null);
    setHistorialCliente(contenedor ? contenedor.fiados.listarHistorialFiado(cliente.id, desde || undefined, hasta || undefined) : []);
    setPagosCliente(contenedor ? contenedor.fiados.listarPagosDeCliente(cliente.id, desde || undefined, hasta || undefined) : []);
    setAnulandoClave(null);
    setMotivoAnulacion('');
    setErrorAnulacion(null);
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
      setHistorialCliente(contenedor.fiados.listarHistorialFiado(cliente.id, desde || undefined, hasta || undefined));
      setPagosCliente(contenedor.fiados.listarPagosDeCliente(cliente.id, desde || undefined, hasta || undefined));
      const actualizado = contenedor.fiados
        .listarClientesConHistorialFiado(desde || undefined, hasta || undefined)
        .find((c) => c.id === cliente.id);
      if (actualizado) setMonto(actualizado.saldoPendiente > 0 ? actualizado.saldoPendiente.toFixed(2) : '');
    } catch (e) {
      setErrorAnulacion(e instanceof ErrorDeNegocio ? e.message : 'No se pudo anular el pago.');
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
      vibrar('cobrar');
      setClienteAbierto(null);
      setFotoPago(null);
      setPagosCliente([]);
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

  async function enviarRecordatorioWhatsApp(cliente: Cliente, diasMasAntigua: number | null) {
    if (!contenedor || !cliente.telefono) return;
    const deudas = contenedor.fiados.listarDeudasPendientesDetalladas(cliente.id);
    const mensaje = construirMensajeDeuda(cliente, deudas, simboloMoneda, diasMasAntigua);
    const enlace = construirEnlaceWhatsApp(cliente.telefono, mensaje, prefijoPais);
    // Primero se abre WhatsApp (el celular puede bloquear ventanas que se abren tras una espera).
    window.open(enlace, '_blank');
    try {
      contenedor.clientes.registrarRecordatorio(cliente.id, ahoraLocalSql());
      await contenedor.persistir();
      recargar();
    } catch {
      /* si no se pudo anotar, el recordatorio igual salió: solo no aparece «Recordado hace…» */
    }
  }

  function abrirAgregarTelefono(cliente: Cliente) {
    setEditandoTelefonoId(cliente.id);
    setTelefonoNuevo('');
    setErrorTelefono(null);
  }

  function cerrarAgregarTelefono() {
    setEditandoTelefonoId(null);
    setTelefonoNuevo('');
    setErrorTelefono(null);
  }

  async function compartirEstadoCuenta(cliente: Cliente) {
    if (!contenedor || generandoEstado) return;
    setGenerandoEstado(true);
    try {
      await compartirEstadoCuentaImagen(contenedor, cliente.id);
    } catch (e) {
      avisar(e instanceof Error && e.message ? e.message : 'No se pudo generar el estado de cuenta.', { tipo: 'error' });
    } finally {
      setGenerandoEstado(false);
    }
  }

  function enviarEstadoCuentaWhatsApp(cliente: Cliente) {
    if (!contenedor || !cliente.telefono) return;
    const mensaje = construirMensajeEstadoCuenta(construirDatosEstadoCuenta(contenedor, cliente.id));
    window.open(construirEnlaceWhatsApp(cliente.telefono, mensaje, prefijoPais), '_blank');
  }

  async function guardarCompromiso(cliente: Cliente, fecha: string | null) {
    if (!contenedor) return;
    setErrorCompromiso(null);
    try {
      contenedor.clientes.guardarFechaCompromiso(cliente.id, fecha);
      await contenedor.persistir();
      recargar();
      avisar(fecha ? AVISOS.compromisoGuardado : AVISOS.compromisoQuitado, { vibrar: 'guardar' });
    } catch (e) {
      setErrorCompromiso({
        clienteId: cliente.id,
        texto: e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar la fecha.',
      });
    }
  }

  async function guardarTelefonoCliente(cliente: Cliente) {
    if (!contenedor) return;
    setErrorTelefono(null);
    if (!(await pedirPermiso('modificar_cliente', 'guardar el teléfono del cliente'))) return;
    try {
      contenedor.clientes.guardarTelefono(cliente.id, telefonoNuevo);
      await contenedor.persistir();
      cerrarAgregarTelefono();
      recargar();
      avisar(AVISOS.telefonoGuardado, { vibrar: 'guardar' });
    } catch (e) {
      setErrorTelefono(e instanceof ErrorDeNegocio ? e.message : 'No se pudo guardar el teléfono.');
    }
  }

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
        (resumen.clientesQueDeben === 0 ? (
          <Tarjeta tono="ok" className="mt-4 text-center">
            <p className="text-base font-bold text-bodega-oscuro">Nadie te debe 🎉</p>
            <p className="mt-1 text-xs text-tinta-suave">Cuando vendas al fiado, aquí verás cuánto te deben.</p>
          </Tarjeta>
        ) : (
          <Tarjeta className="mt-4" role="region" aria-label="Resumen de fiados">
            <p className="text-xs font-semibold text-tinta/70">Total por cobrar</p>
            <Monto valor={resumen.totalPorCobrar} simbolo={simboloMoneda} tamano="grande" className="mt-0.5" />
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-linea pt-3">
              <div>
                <p className="text-xs text-tinta-suave">Clientes que deben</p>
                <p className="text-lg font-extrabold text-tinta">{resumen.clientesQueDeben}</p>
              </div>
              <div>
                <p className="text-xs text-tinta-suave">Monto vencido</p>
                <Monto
                  valor={resumen.montoVencido}
                  simbolo={simboloMoneda}
                  tamano="mediano"
                  tono={resumen.montoVencido > 0 ? 'alerta' : 'normal'}
                />
                <p className="text-xs text-tinta-suave">Más de {DIAS_VENCIDO_FIADO} días</p>
              </div>
            </div>
          </Tarjeta>
        ))}

      {clientes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Ordenar y filtrar">
          {ORDENES_FIADOS.map((o) => (
            <button
              key={o.valor}
              type="button"
              aria-pressed={orden === o.valor}
              onClick={() => setOrden(o.valor)}
              className={`h-8 rounded-full border px-3 text-xs font-medium ${
                orden === o.valor ? 'border-bodega bg-bodega text-white' : 'border-linea text-tinta/70'
              }`}
            >
              {o.etiqueta}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={soloVencidos}
            onClick={() => setSoloVencidos((v) => !v)}
            className={`h-8 rounded-full border px-3 text-xs font-medium ${
              soloVencidos ? 'border-alerta bg-alerta text-white' : 'border-alerta/50 text-alerta'
            }`}
          >
            Solo vencidos
          </button>
          <button
            type="button"
            aria-pressed={soloCompromisosVencidos}
            onClick={() => setSoloCompromisosVencidos((v) => !v)}
            className={`h-8 rounded-full border px-3 text-xs font-medium ${
              soloCompromisosVencidos ? 'border-alerta bg-alerta text-white' : 'border-alerta/50 text-alerta'
            }`}
          >
            Compromisos vencidos
          </button>
        </div>
      )}

      {!mostrarFechas && (
        <button
          type="button"
          onClick={() => setMostrarFechas(true)}
          className="mt-3 self-start text-xs font-semibold text-bodega-oscuro"
        >
          Ver historial por fechas
        </button>
      )}

      {mostrarFechas && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-tinta/70">Rango de fechas (opcional)</p>
          <p className="mt-0.5 text-xs text-tinta-suave">Muestra solo los fiados y los pagos realizados dentro de ese rango — incluye a quienes ya lo pagaron todo.</p>
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
            <button
              onClick={() => {
                setDesde('');
                setHasta('');
                setMostrarFechas(false);
              }}
              className="mt-6 h-11 shrink-0 rounded-lg border border-linea px-3 text-xs font-semibold text-tinta-suave"
            >
              Cerrar
            </button>
          </div>
          {rangoInvalido && (
            <p className="mt-2 text-xs text-alerta">La fecha "desde" no puede ser posterior a "hasta".</p>
          )}
        </div>
      )}

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre, teléfono o DNI…"
        className="mt-3 h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
      />

      <main className="mt-4 flex-1">
        {(cargando || !datosListos) && !error && <EsqueletoLista />}
        {error && <p className="text-sm text-alerta">{error.message}</p>}

        {!cargando && datosListos && mostrarFechas && clientes.length === 0 && (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta-suave">
            Todavía no tienes ventas al fiado en este rango.
          </p>
        )}

        {!cargando && clientes.length > 0 && filasVisibles.length === 0 && busqueda.trim() !== '' && (
          <p className="border-y border-linea py-6 text-center text-sm text-tinta-suave">
            Ningún cliente coincide con "{busqueda}".
          </p>
        )}

        {!cargando &&
          clientes.length > 0 &&
          filasVisibles.length === 0 &&
          busqueda.trim() === '' &&
          (soloVencidos || soloCompromisosVencidos) && (
            <p className="border-y border-linea py-6 text-center text-sm text-tinta-suave">
              {soloCompromisosVencidos && !soloVencidos
                ? 'Nadie se pasó de su compromiso de pago.'
                : `Nadie tiene deudas de más de ${DIAS_VENCIDO_FIADO} días.`}
            </p>
          )}

        <ul className="divide-y divide-linea border-y border-linea">
          {filasVisibles.map((fila) => {
            const cliente = fila.cliente;
            const debe = cliente.saldoPendiente > 0;
            const compromiso = compromisoVigente(cliente.fechaCompromiso, cliente.saldoPendiente);
            const estadoComp = estadoCompromiso(compromiso, hoy);
            const textoComp = textoCompromiso(compromiso, hoy);
            return (
              <li key={cliente.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => alternarCliente(cliente)}
                      className="block w-full truncate text-left text-sm text-tinta"
                    >
                      {cliente.nombre}
                    </button>
                    {debe && (fila.diasMasAntigua !== null || textoRecordado(cliente.ultimoRecordatorioEn, hoy) !== '' || textoComp !== '') && (
                      <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs">
                        {fila.diasMasAntigua !== null && (
                          <span className={`font-medium ${CLASE_ANTIGUEDAD[nivelAntiguedad(fila.diasMasAntigua)]}`}>
                            {textoAntiguedad(fila.diasMasAntigua)}
                          </span>
                        )}
                        {textoRecordado(cliente.ultimoRecordatorioEn, hoy) !== '' && (
                          <span className="text-tinta-suave">{textoRecordado(cliente.ultimoRecordatorioEn, hoy)}</span>
                        )}
                        {textoComp !== '' && (
                          <span
                            className={
                              estadoComp === 'vencido'
                                ? 'font-semibold text-alerta'
                                : estadoComp === 'hoy'
                                  ? 'font-medium text-acento-oscuro'
                                  : 'font-medium text-bodega-oscuro'
                            }
                          >
                            {textoComp}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {debe ? (
                      <Monto valor={cliente.saldoPendiente} simbolo={simboloMoneda} tamano="mini" tono="alerta" />
                    ) : (
                      <span className="text-sm font-semibold text-ok">Pagado</span>
                    )}
                    {debe &&
                      (cliente.telefono ? (
                        <button
                          onClick={() => enviarRecordatorioWhatsApp(cliente, fila.diasMasAntigua)}
                          disabled={!esPremium}
                          title={!esPremium ? 'Función Premium' : undefined}
                          className="group inline-flex items-center gap-1 text-xs font-semibold text-bodega-oscuro disabled:text-tinta/30"
                        >
                          <IconoWhatsApp tamano={16} className="text-[#25D366] group-disabled:opacity-40" />
                          WhatsApp
                        </button>
                      ) : (
                        <button
                          onClick={() => abrirAgregarTelefono(cliente)}
                          className="text-xs font-semibold text-bodega-oscuro"
                        >
                          Agregar teléfono
                        </button>
                      ))}
                    <button
                      onClick={() => alternarCliente(cliente)}
                      className="text-xs font-semibold text-bodega-oscuro"
                    >
                      {clienteAbierto === cliente.id ? 'Cerrar' : 'Detalle'}
                    </button>
                  </div>
                </div>

                {editandoTelefonoId === cliente.id && (
                  <div className="mt-3 space-y-2 rounded-xl border border-linea p-3">
                    <CampoTexto
                      label={`Teléfono de ${cliente.nombre}`}
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
                        onClick={() => guardarTelefonoCliente(cliente)}
                      >
                        Guardar teléfono
                      </Boton>
                      <Boton variante="secundario" tamano="chico" anchoCompleto={false} onClick={cerrarAgregarTelefono}>
                        Cancelar
                      </Boton>
                    </div>
                    {!esPremium && (
                      <p className="text-xs text-tinta-suave">
                        Enviar recordatorios por WhatsApp es <span className="font-semibold text-acento-oscuro">Premium</span>
                      </p>
                    )}
                  </div>
                )}

                {clienteAbierto === cliente.id && (
                  <div className="mt-3 space-y-3 rounded-xl border border-linea p-3">
                    {estadoCuentaAbierto && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-xs text-tinta-suave">Debe</p>
                            <Monto
                              valor={estadoCuentaAbierto.saldoActual}
                              simbolo={simboloMoneda}
                              tamano="mediano"
                              tono={estadoCuentaAbierto.saldoActual > 0 ? 'alerta' : 'ok'}
                            />
                          </div>
                          <div>
                            <p className="text-xs text-tinta-suave">Fiado total</p>
                            <Monto valor={estadoCuentaAbierto.totalFiado} simbolo={simboloMoneda} tamano="mediano" />
                          </div>
                          <div>
                            <p className="text-xs text-tinta-suave">Pagado</p>
                            <Monto valor={estadoCuentaAbierto.totalPagado} simbolo={simboloMoneda} tamano="mediano" tono="ok" />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Boton
                            variante="secundario"
                            tamano="chico"
                            anchoCompleto={false}
                            className="flex-1 px-2"
                            disabled={generandoEstado}
                            onClick={() => compartirEstadoCuenta(cliente)}
                          >
                            {generandoEstado ? 'Generando…' : 'Estado de cuenta'}
                          </Boton>
                          <Boton
                            variante="secundario"
                            tamano="chico"
                            anchoCompleto={false}
                            className="flex-1 px-2"
                            disabled={!cliente.telefono || !esPremium}
                            onClick={() => enviarEstadoCuentaWhatsApp(cliente)}
                          >
                            <IconoWhatsApp tamano={16} className="mr-1.5 text-[#25D366]" />
                            Por WhatsApp
                          </Boton>
                        </div>
                        {!esPremium ? (
                          <p className="text-xs text-tinta-suave">
                            Enviarlo por WhatsApp es <span className="font-semibold text-acento-oscuro">Premium</span>. La
                            imagen la puedes compartir gratis.
                          </p>
                        ) : !cliente.telefono ? (
                          <p className="text-xs text-tinta-suave">Agrega su teléfono para enviarlo por WhatsApp.</p>
                        ) : null}
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-semibold text-tinta/70">Historial de fiados</p>
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
                                    {venta.ventaId ? `V-${venta.ventaId}` : 'Deuda'} ·{' '}
                                    {formatearFechaHora(venta.fecha)}
                                  </span>
                                  <span
                                    className={`font-semibold ${anulada ? 'text-tinta-suave' : pagada ? 'text-ok' : 'text-alerta'}`}
                                  >
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
                                <span className={pago.anulado ? 'line-through text-tinta-suave' : ''}>
                                  {formatearFechaHora(pago.fecha)} · {pago.metodoPago}
                                  {pago.ventas.length > 0 && ` · ${pago.ventas.map((id) => `V-${id}`).join(', ')}`}
                                </span>
                                <span
                                  className={`font-semibold ${
                                    pago.anulado ? 'line-through text-tinta-suave' : 'text-bodega-oscuro'
                                  }`}
                                >
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
                                    Se reabrirá la deuda por {formatearMonto(pago.monto, simboloMoneda)} y se
                                    registrará un egreso en Caja.
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
                                      onClick={() => confirmarAnulacionPago(cliente, pago)}
                                      disabled={motivoAnulacion.trim().length === 0}
                                      className="h-9 flex-1 rounded-lg border border-alerta text-xs font-semibold text-alerta disabled:opacity-40"
                                    >
                                      Anular pago
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
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

                    {debe && (
                      <div className="space-y-2 border-t border-linea pt-3">
                        <p className="text-xs font-semibold text-tinta/70">Me paga el…</p>
                        <div className="flex flex-wrap gap-2">
                          {atajos.map((atajo) => (
                            <button
                              key={atajo.id}
                              type="button"
                              aria-pressed={compromiso === atajo.fecha}
                              onClick={() => guardarCompromiso(cliente, atajo.fecha)}
                              className={`h-8 rounded-full border px-3 text-xs font-medium ${
                                compromiso === atajo.fecha
                                  ? 'border-bodega bg-bodega text-white'
                                  : 'border-linea text-tinta/70'
                              }`}
                            >
                              {atajo.etiqueta}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-end gap-2">
                          <CampoTexto
                            className="flex-1"
                            type="date"
                            label="Otra fecha"
                            min={hoy}
                            value={compromiso ?? ''}
                            onChange={(e) => {
                              if (e.target.value) guardarCompromiso(cliente, e.target.value);
                            }}
                            error={errorCompromiso?.clienteId === cliente.id ? errorCompromiso.texto : null}
                          />
                          {compromiso && (
                            <Boton
                              variante="secundario"
                              tamano="chico"
                              anchoCompleto={false}
                              className="mb-0.5"
                              onClick={() => guardarCompromiso(cliente, null)}
                            >
                              Quitar
                            </Boton>
                          )}
                        </div>
                      </div>
                    )}

                    {debe && (
                      <div className="space-y-3 border-t border-linea pt-3">
                        <p className="text-xs font-semibold text-tinta/70">Registrar pago</p>
                        <CampoTexto
                          label="Monto del pago"
                          value={monto}
                          onChange={(e) => setMonto(limpiarNumeroEscrito(e.target.value))}
                          inputMode="decimal"
                          placeholder="0.00"
                          error={validarMontoPago(monto, cliente.saldoPendiente, simboloMoneda)}
                        />
                        <div className="flex gap-2">
                          <Boton
                            variante="suave"
                            tamano="chico"
                            anchoCompleto={false}
                            className="flex-1 px-2"
                            onClick={() => setMonto(textoMontoCampo(montoCobrarTodo(cliente.saldoPendiente)))}
                          >
                            Cobrar todo
                          </Boton>
                          <Boton
                            variante="suave"
                            tamano="chico"
                            anchoCompleto={false}
                            className="flex-1 px-2"
                            onClick={() => setMonto(textoMontoCampo(montoPagarMitad(cliente.saldoPendiente)))}
                          >
                            Pagar la mitad
                          </Boton>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {METODOS.map((m) => (
                            <button
                              key={m.valor}
                              onClick={() => {
                                setMetodo(m.valor);
                                if (m.valor !== 'yape' && m.valor !== 'plin') setFotoPago(null);
                              }}
                              className={`h-8 rounded-full border px-3 text-xs font-medium ${
                                metodo === m.valor
                                  ? 'border-bodega bg-bodega text-white'
                                  : 'border-linea text-tinta/70'
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
                                Adjuntar foto del pago{' '}
                                <span className="font-semibold text-acento-oscuro">Premium</span>
                              </p>
                            ) : fotoPago ? (
                              <div className="flex items-center justify-between rounded-lg border border-linea px-3 py-2 text-xs">
                                <span className="text-tinta/70">Foto del pago adjuntada</span>
                                <button
                                  type="button"
                                  onClick={() => setFotoPago(null)}
                                  className="font-semibold text-alerta"
                                >
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
                        <Boton
                          tamano="chico"
                          onClick={() => confirmarPago(cliente)}
                          disabled={!monto || Number(monto) <= 0 || validarMontoPago(monto, cliente.saldoPendiente, simboloMoneda) !== null}
                        >
                          Confirmar pago
                        </Boton>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
