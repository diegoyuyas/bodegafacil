'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { usarPermisos } from '@/hooks/usar-permisos';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import type { LineaVentaResumen, ResumenDia, VentaListaItem } from '@/core/tipos';
import { LIMITE_VENTAS_PLAN_GRATIS } from '@/core/plan';
import type { EstadoPlan } from '@/core/plan';
import {
  CLAVE_NOMBRE_TIENDA,
  obtenerNombreTienda,
} from '@/core/configuracion';
import { CLAVE_PREFIJO_PAIS, obtenerPrefijoPais } from '@/core/paises';
import { construirMensajeVenta } from '@/core/whatsapp';
import { construirEnlaceWhatsApp } from '@/infraestructura/whatsapp/enlace';
import { imprimirComprobanteDeVenta } from '@/infraestructura/impresora-bluetooth/imprimir-venta';
import { CLAVE_IMPRESORA_ACTIVA, IMPRESION_BLUETOOTH_DISPONIBLE } from '@/core/impresora';
import { guardarTicketComoImagen } from '@/infraestructura/comprobante-imagen/compartir-ticket';
import { MenuImprimirTicket } from '@/components/menu-imprimir-ticket';
import { DetalleVentaSheet } from '@/components/detalle-venta-sheet';
import { avisoAnulacionFiado } from '@/core/detalle-venta';
import { EsqueletoLista } from '@/components/ui/esqueleto';
import { EstadoVacio } from '@/components/ui/estado-vacio';
import { TarjetaParaHoy } from '@/components/tarjeta-para-hoy';
import { CLAVE_ULTIMO_RESPALDO_MANUAL, construirParaHoy, estadoRespaldo, type PendienteHoy } from '@/core/para-hoy';
import { calcularResumenFiados, construirFilasFiado } from '@/core/fiados-resumen';
import { filtrarCompromisosVencidos, sumarDias } from '@/core/fiados-compromiso';
import { GraficoVentas } from '@/components/grafico-ventas';
import {
  mejorDia,
  productoMasVendido,
  textoCantidad,
  totalDeLosDias,
  ventasUltimosDias,
  type DiaVentas,
  type ProductoMasVendido,
} from '@/core/ventas-semana';
import { leerConfigBackupAutomatico } from '@/infraestructura/backup-automatico/config';
import { Monto } from '@/components/ui/monto';
import { formatearFechaHora, hoyLocalSql } from '@/core/tiempo';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Pantalla de inicio — resumen del día (sección 7 del documento maestro),
 * con la lista de ventas de hoy (cliente, preview de productos, y
 * anular) agregada a pedido.
 */

const ETIQUETAS_METODO_PAGO: Record<string, string> = {
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  tarjeta: 'Tarjeta',
  fiado: 'Fiado',
};

export default function PaginaInicio() {
  const router = useRouter();
  const { contenedor, error, cargando } = usarContenedor();
  const { pedirPermiso, modalPermiso } = usarPermisos(contenedor);
  const [simboloMoneda, setSimboloMoneda] = useState(obtenerSimboloMoneda(null));
  const [prefijoPais, setPrefijoPais] = useState(obtenerPrefijoPais(null));
  const [imprimiendoVentaId, setImprimiendoVentaId] = useState<number | null>(null);
  const [mensajeImpresion, setMensajeImpresion] = useState<string | null>(null);
  const [ventaMenuTicket, setVentaMenuTicket] = useState<VentaListaItem | null>(null);
  const [impresoraActiva, setImpresoraActiva] = useState(false);
  // El botón "Nueva Venta por Voz" solo aparece con el modo voz en ON y plan Premium.

  useEffect(() => {
    if (!contenedor) return;
    setSimboloMoneda(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
    setPrefijoPais(obtenerPrefijoPais(contenedor.configuracion.obtenerValor(CLAVE_PREFIJO_PAIS)));
  }, [contenedor]);
  const [resumen, setResumen] = useState<ResumenDia | null>(null);
  const [pedidosDelRango, setPedidosDelRango] = useState<VentaListaItem[]>([]);
  const [totalHistorico, setTotalHistorico] = useState(0);
  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  // Venta cuyo detalle se muestra en el pop-up del Historial de ventas.
  const [ventaDetalle, setVentaDetalle] = useState<VentaListaItem | null>(null);
  const [lineasPorVenta, setLineasPorVenta] = useState<Record<number, LineaVentaResumen[]>>({});
  const [pedidosAbiertos, setPedidosAbiertos] = useState(false);
  const [busquedaPedidos, setBusquedaPedidos] = useState('');
  // "Historial de ventas": por defecto la fecha de hoy; si se cambia el
  // rango, la etiqueta pasa de "Hoy" a "Total" (ver más abajo).
  const [desdePedidos, setDesdePedidos] = useState(hoyLocalSql());
  const [hastaPedidos, setHastaPedidos] = useState(hoyLocalSql());
  const [nombreTienda, setNombreTienda] = useState(obtenerNombreTienda(null));
  // Tarjeta «Para hoy»: null mientras no se han leído los datos.
  const [paraHoy, setParaHoy] = useState<PendienteHoy[] | null>(null);
  // Ventas de los últimos 7 días (gráfico) y producto más vendido de hoy.
  const [diasSemana, setDiasSemana] = useState<DiaVentas[] | null>(null);
  const [masVendidoHoy, setMasVendidoHoy] = useState<ProductoMasVendido | null>(null);

  // Gesto secreto: tocar 5 veces el título entra al panel de administrador.
  // No aparece en ningún menú a propósito — es solo para el dueño de la app.
  const toquesTitulo = useRef(0);
  const temporizadorToques = useRef<ReturnType<typeof setTimeout> | null>(null);

  function tocarTitulo() {
    toquesTitulo.current += 1;
    if (temporizadorToques.current) clearTimeout(temporizadorToques.current);
    if (toquesTitulo.current >= 5) {
      toquesTitulo.current = 0;
      router.push('/admin');
      return;
    }
    temporizadorToques.current = setTimeout(() => {
      toquesTitulo.current = 0;
    }, 2000);
  }

  function recargar() {
    if (!contenedor) return;
    const resumenDelDia = contenedor.ventas.resumenDelDia();
    setResumen(resumenDelDia);
    setPedidosDelRango(contenedor.ventas.listarPorRangoConDetalle(desdePedidos, hastaPedidos));
    setTotalHistorico(contenedor.ventas.contarTotalHistorico());
    const estado = contenedor.plan.obtenerEstado();
    setEstadoPlan(estado);
    setImpresoraActiva(contenedor.configuracion.obtenerValor(CLAVE_IMPRESORA_ACTIVA) === '1');
    setNombreTienda(obtenerNombreTienda(contenedor.configuracion.obtenerValor(CLAVE_NOMBRE_TIENDA)));

    // «Para hoy»: fiados vencidos (F1), compromisos de pago pasados (F4), stock bajo y respaldo pendiente.
    const hoy = hoyLocalSql();

    // Gráfico de los últimos 7 días y producto más vendido de hoy (solo ventas no anuladas).
    const ventasSemana = contenedor.ventas.listarPorRangoConDetalle(sumarDias(hoy, -6), hoy);
    setDiasSemana(ventasUltimosDias(ventasSemana, hoy));
    setMasVendidoHoy(
      productoMasVendido(
        ventasSemana
          .filter((v) => !v.anulada && v.fechaHora.startsWith(hoy))
          .flatMap((v) => contenedor.ventas.obtenerLineas(v.id)),
      ),
    );

    const deudores = contenedor.fiados.listarClientesConDeuda();
    const antiguedad = contenedor.fiados.listarDeudasPorAntiguedad(hoy);
    const resumenFiados = calcularResumenFiados(deudores, antiguedad);
    const compromisosVencidos = filtrarCompromisosVencidos(construirFilasFiado(deudores, antiguedad), hoy).length;
    const configBackup = leerConfigBackupAutomatico(contenedor);
    setParaHoy(
      construirParaHoy({
        productosStockBajo: resumenDelDia.productosStockBajo,
        clientesVencidos: resumenFiados.clientesVencidos,
        montoVencido: resumenFiados.montoVencido,
        compromisosVencidos,
        respaldo: estadoRespaldo({
          hayDatos: contenedor.ventas.contarTotalHistorico() > 0 || contenedor.productos.listarTodos().length > 0,
          autoActivo: configBackup.activo,
          frecuenciaDias: configBackup.frecuenciaDias,
          ultimaAuto: configBackup.ultimaFecha,
          ultimoManual: contenedor.configuracion.obtenerValor(CLAVE_ULTIMO_RESPALDO_MANUAL),
          hoy,
        }),
        simboloMoneda: obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)),
      }),
    );
  }

  useEffect(recargar, [contenedor, desdePedidos, hastaPedidos]);

  useEffect(() => {
    if (!pedidosAbiertos || !contenedor) return;
    setLineasPorVenta((actual) => {
      const faltantes = pedidosDelRango.filter((v) => !actual[v.id]);
      if (faltantes.length === 0) return actual;
      const nuevas = { ...actual };
      for (const venta of faltantes) {
        nuevas[venta.id] = contenedor.ventas.obtenerLineas(venta.id);
      }
      return nuevas;
    });
  }, [pedidosAbiertos, contenedor, pedidosDelRango]);

  const pedidosFiltrados = useMemo(() => {
    const texto = busquedaPedidos.trim().toLowerCase();
    if (!texto) return pedidosDelRango;
    return pedidosDelRango.filter((venta) => {
      const nombreCliente = (venta.clienteNombre ?? 'Cliente eventual').toLowerCase();
      if (nombreCliente.includes(texto)) return true;
      if (venta.total.toFixed(2).includes(texto)) return true;
      const lineas = lineasPorVenta[venta.id] ?? [];
      return lineas.some((linea) => linea.producto.toLowerCase().includes(texto));
    });
  }, [pedidosDelRango, busquedaPedidos, lineasPorVenta]);

  // Cuántos pedidos mostrar en el título — sin contar los anulados — y
  // si el rango elegido es "hoy" (etiqueta "Hoy") o cualquier otro
  // rango (etiqueta "Total").
  const pedidosNoAnulados = pedidosDelRango.filter((v) => !v.anulada).length;
  const totalPedidosDelRango = pedidosDelRango
    .filter((v) => !v.anulada)
    .reduce((suma, v) => suma + v.total, 0);
  const rangoEsHoy = desdePedidos === hoyLocalSql() && hastaPedidos === hoyLocalSql();
  const rangoInvalido = desdePedidos > hastaPedidos;

  function abrirDetalle(venta: VentaListaItem) {
    setMensajeImpresion(null);
    setVentaDetalle(venta);
    if (!lineasPorVenta[venta.id] && contenedor) {
      const lineas = contenedor.ventas.obtenerLineas(venta.id);
      setLineasPorVenta((actual) => ({ ...actual, [venta.id]: lineas }));
    }
  }

  async function anularVenta(venta: VentaListaItem) {
    if (!contenedor) return;

    // Venta al fiado con abonos ya cobrados: se anula solo lo que falta por
    // cobrar, y se pregunta qué pasó con el dinero que ya había entrado.
    const cobrado =
      venta.metodoPago === 'fiado' ? contenedor.ventas.obtenerCobradoDeVentaFiada(venta.id) : 0;
    const montoCobrado = formatearMonto(cobrado, simboloMoneda);

    // La confirmación («¿Seguro que quieres anular esta venta?») ya la dio el usuario en el pop-up.
    if (!(await pedirPermiso('anular_venta', `anular el pedido V-${venta.id}`))) return;

    let devolverCobrado = false;
    if (cobrado > 0) {
      devolverCobrado = window.confirm(
        `¿Le devolviste ${montoCobrado} al cliente?\n\nAceptar = Sí: se registra la devolución como egreso en Caja.\nCancelar = No: el dinero cobrado se queda en Caja.`,
      );
    }

    setMensajeImpresion(null);
    try {
      contenedor.ventas.anularVenta(venta.id, undefined, { devolverCobrado });
      await contenedor.persistir();
      setVentaDetalle(null);
      recargar();
    } catch (e) {
      setMensajeImpresion(e instanceof Error ? e.message : 'No se pudo anular el pedido.');
    }
  }

  /**
   * Reenvía el detalle de una venta ya confirmada por WhatsApp (Objetivo
   * 3): prioriza el teléfono del cliente registrado; si no tiene, o si
   * es cliente eventual, usa el teléfono que haya quedado guardado en
   * la propia venta. Si tampoco hay uno guardado, lo pide en el momento
   * (window.prompt, igual de simple que el confirm de "Anular venta") y
   * lo guarda en la venta para no volver a pedirlo. Nunca envía
   * automático: solo abre wa.me con el mensaje ya escrito, el usuario
   * presiona "Enviar".
   */
  async function enviarWhatsAppDeVenta(venta: VentaListaItem) {
    if (!contenedor) return;
    const ventaCompleta = contenedor.ventas.obtenerPorId(venta.id);

    let telefono: string | null = ventaCompleta.telefonoWhatsapp;
    if (ventaCompleta.clienteId) {
      try {
        const cliente = contenedor.clientes.obtenerPorId(ventaCompleta.clienteId);
        telefono = cliente.telefono ?? ventaCompleta.telefonoWhatsapp;
      } catch {
        // Cliente ya no existe: se usa el teléfono guardado en la venta, si lo hay.
      }
    }

    if (!telefono) {
      const ingresado = window.prompt(
        `Esta venta no tiene un número de celular. Ingresa el número (sin prefijo de país, +${prefijoPais} se agrega solo):`,
      );
      const limpio = ingresado?.trim();
      if (!limpio) return; // el usuario canceló o dejó el campo vacío
      telefono = limpio;
      contenedor.ventas.actualizarTelefonoWhatsapp(venta.id, telefono);
      await contenedor.persistir();
    }

    const lineasMensaje = contenedor.ventas.obtenerLineasParaMensaje(venta.id);
    const mensaje = construirMensajeVenta(nombreTienda, ventaCompleta, lineasMensaje, simboloMoneda);
    const enlace = construirEnlaceWhatsApp(telefono, mensaje, prefijoPais);
    window.open(enlace, '_blank');
  }

  /**
   * Botón de impresora al lado del de WhatsApp — abre el menú "Imprimir
   * en ticketera / Guardar como..." para reconstruir el ticket de un
   * pedido ya confirmado.
   */
  function abrirMenuTicket(venta: VentaListaItem) {
    setMensajeImpresion(null);
    setVentaMenuTicket(venta);
  }

  async function imprimirEnTicketeraDesdeMenu() {
    if (!contenedor || !ventaMenuTicket) return;
    const ventaId = ventaMenuTicket.id;
    setVentaMenuTicket(null);
    setImprimiendoVentaId(ventaId);
    try {
      await imprimirComprobanteDeVenta(contenedor, ventaId);
    } catch {
      setMensajeImpresion('No está correctamente configurada la impresora.');
    } finally {
      setImprimiendoVentaId(null);
    }
  }

  async function guardarComoDesdeMenu() {
    if (!contenedor || !ventaMenuTicket) return;
    const ventaId = ventaMenuTicket.id;
    setVentaMenuTicket(null);
    setImprimiendoVentaId(ventaId);
    try {
      await guardarTicketComoImagen(contenedor, ventaId);
    } catch {
      setMensajeImpresion('No se pudo generar la imagen del ticket.');
    } finally {
      setImprimiendoVentaId(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col">
      {modalPermiso}
      <header className="flex items-baseline justify-between px-5 pt-6">
        <h1
          onClick={tocarTitulo}
          className="text-lg font-extrabold tracking-tight text-bodega-oscuro select-none"
        >
          {nombreTienda}
        </h1>
        <span className="text-sm text-tinta-suave">
          {new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}
        </span>
      </header>

      {/* pb: deja libre el botón flotante «Nueva venta» (vive en el layout: 72 px + 16 px sobre la barra) para que no tape el último elemento */}
      <main className="flex-1 px-5 pb-[calc(10.5rem+var(--area-segura-abajo))] pt-6">
        {cargando && <EsqueletoLista filas={3} />}
        {error && (
          <p className="text-sm text-alerta">
            No se pudo abrir la base de datos local: {error.message}
          </p>
        )}

        {estadoPlan && estadoPlan.tipo === 'premium' && (
          <div className="mb-4 rounded-xl border border-bodega bg-bodega-claro/40 px-4 py-3 text-sm text-tinta">
            <span className="font-semibold text-bodega-oscuro">Plan Premium</span> — te quedan{' '}
            <span className="font-semibold">
              {estadoPlan.diasRestantes} {estadoPlan.diasRestantes === 1 ? 'día' : 'días'}
            </span>
            .
          </div>
        )}

        {estadoPlan && estadoPlan.tipo === 'gratis' && (
          <div
            className={`mb-4 rounded-xl border px-4 py-3 text-sm text-tinta ${
              totalHistorico >= LIMITE_VENTAS_PLAN_GRATIS
                ? 'border-alerta bg-alerta/10'
                : totalHistorico >= LIMITE_VENTAS_PLAN_GRATIS - 20
                  ? 'border-acento bg-acento/10'
                  : 'border-linea'
            }`}
          >
            {totalHistorico >= LIMITE_VENTAS_PLAN_GRATIS ? (
              <>
                Llegaste al límite de{' '}
                <span className="font-semibold">{LIMITE_VENTAS_PLAN_GRATIS} pedidos</span> del Plan
                Gratis. Contacta a soporte para activar Premium.
              </>
            ) : (
              <>
                Plan Gratis:{' '}
                <span className="font-semibold">
                  {totalHistorico}/{LIMITE_VENTAS_PLAN_GRATIS}
                </span>{' '}
                pedidos usados.
              </>
            )}
          </div>
        )}

        {resumen && (
          <>
            {/* Hero: lo primero que el bodeguero necesita saber */}
            <section aria-label="Resumen de ventas de hoy">
              <p className="text-sm text-tinta-suave">Ventas de hoy</p>
              <p className="mt-1">
                <Monto valor={resumen.totalVentas} simbolo={simboloMoneda} tamano="enorme" />
              </p>
              <p className="mt-2 text-sm text-bodega-oscuro">
                Ganancia estimada {formatearMonto(resumen.gananciaEstimada, simboloMoneda)} ·{' '}
                {resumen.numeroVentas} {resumen.numeroVentas === 1 ? 'venta' : 'ventas'}
              </p>
            </section>

            {/* Desglose por método de pago */}
            <section aria-label="Ventas por método de pago" className="mt-8">
              {resumen.porMetodoPago.length === 0 ? (
                <EstadoVacio
                  titulo="Todavía no registras ventas hoy"
                  descripcion="Cuando vendas, aquí verás cuánto entró por cada forma de pago."
                  textoAccion="Hacer una venta"
                  hrefAccion="/ventas/nueva"
                />
              ) : (
                <ul className="divide-y divide-linea border-y border-linea">
                  {resumen.porMetodoPago.map((fila) => (
                    <li
                      key={fila.metodo}
                      className="flex items-center justify-between py-3 text-sm"
                    >
                      <span className="text-tinta/80">
                        {ETIQUETAS_METODO_PAGO[fila.metodo] ?? fila.metodo}
                      </span>
                      <span className="font-semibold text-tinta">
                        {formatearMonto(fila.monto, simboloMoneda)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Para hoy: lo que requiere atención (fiados vencidos, stock bajo, respaldo) */}
            <section aria-label="Alertas" className="mt-6 space-y-3">
              {paraHoy && <TarjetaParaHoy pendientes={paraHoy} />}
              {resumen.totalPorCobrar > 0 && (
                <div className="flex items-start gap-3 text-sm">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-acento" aria-hidden />
                  <p className="text-tinta/80">
                    <span className="font-semibold text-tinta">
                      {formatearMonto(resumen.totalPorCobrar, simboloMoneda)}
                    </span>{' '}
                    pendientes de cobro
                  </p>
                </div>
              )}
            </section>

            {/* Ventas de los últimos 7 días + producto más vendido de hoy */}
            {diasSemana && (
              <section aria-label="Ventas de los últimos 7 días" className="mt-6">
                <h2 className="text-sm font-bold text-bodega-oscuro">Ventas de los últimos 7 días</h2>
                {totalDeLosDias(diasSemana) > 0 ? (
                  <p className="mt-0.5 text-xs text-tinta-suave">
                    Total {formatearMonto(totalDeLosDias(diasSemana), simboloMoneda)}
                    {mejorDia(diasSemana) && (
                      <>
                        {' '}
                        · Mejor día: {mejorDia(diasSemana)?.esHoy ? 'hoy' : mejorDia(diasSemana)?.etiqueta}{' '}
                        {formatearMonto(mejorDia(diasSemana)?.total ?? 0, simboloMoneda)}
                      </>
                    )}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-tinta-suave">Aquí verás cómo van tus ventas día a día.</p>
                )}
                <div className="mt-3">
                  <GraficoVentas dias={diasSemana} simboloMoneda={simboloMoneda} />
                </div>
                {masVendidoHoy && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-linea px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-xs text-tinta-suave">Más vendido hoy</p>
                      <p className="truncate text-sm font-semibold text-tinta">{masVendidoHoy.producto}</p>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-bodega-oscuro">
                      {textoCantidad(masVendidoHoy.cantidad)} {masVendidoHoy.cantidad === 1 ? 'vendido' : 'vendidos'}
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* Historial de ventas: rango de fechas + desplegable con buscador; al tocar una venta se abre su detalle */}
            <section aria-label="Historial de ventas" className="mt-8">
              <button
                onClick={() => setPedidosAbiertos((v) => !v)}
                className="flex w-full items-center justify-between border-y border-linea py-3 text-sm font-semibold text-tinta"
              >
                <span>Historial de ventas ({rangoEsHoy ? 'Hoy' : 'Total'}: {pedidosNoAnulados})</span>
                <span className={`text-tinta-suave transition-transform ${pedidosAbiertos ? 'rotate-180' : ''}`}>
                  ⌄
                </span>
              </button>

              {pedidosAbiertos && (
                <div className="pt-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-tinta-suave">Desde</label>
                      <input
                        type="date"
                        value={desdePedidos}
                        onChange={(e) => setDesdePedidos(e.target.value)}
                        max={hastaPedidos}
                        className="h-11 w-full rounded-lg border border-linea px-2 text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-tinta-suave">Hasta</label>
                      <input
                        type="date"
                        value={hastaPedidos}
                        onChange={(e) => setHastaPedidos(e.target.value)}
                        min={desdePedidos}
                        className="h-11 w-full rounded-lg border border-linea px-2 text-sm"
                      />
                    </div>
                    {!rangoEsHoy && (
                      <button
                        onClick={() => {
                          setDesdePedidos(hoyLocalSql());
                          setHastaPedidos(hoyLocalSql());
                        }}
                        className="mt-6 h-11 shrink-0 rounded-lg border border-linea px-3 text-xs font-semibold text-tinta-suave"
                      >
                        Hoy
                      </button>
                    )}
                  </div>
                  {rangoInvalido && (
                    <p className="mt-2 text-xs text-alerta">La fecha "desde" no puede ser posterior a "hasta".</p>
                  )}
                  <input
                    value={busquedaPedidos}
                    onChange={(e) => setBusquedaPedidos(e.target.value)}
                    placeholder="Buscar por monto, cliente o producto…"
                    className="mt-3 h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
                  />

                  {mensajeImpresion && <p className="mt-2 text-xs text-alerta">{mensajeImpresion}</p>}

                  {pedidosDelRango.length === 0 ? (
                    <p className="border-y border-linea py-6 text-center text-sm text-tinta-suave mt-3">
                      No hay ventas en este rango de fechas.
                    </p>
                  ) : pedidosFiltrados.length === 0 ? (
                    <p className="border-y border-linea py-6 text-center text-sm text-tinta-suave mt-3">
                      Ninguna venta coincide con "{busquedaPedidos}".
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-linea border-y border-linea">
                      {pedidosFiltrados.map((venta) => (
                        <li key={venta.id}>
                          <button
                            type="button"
                            onClick={() => abrirDetalle(venta)}
                            className="flex w-full items-center justify-between gap-3 py-3 text-left"
                          >
                            <div className="min-w-0">
                              <p className="flex flex-wrap items-center gap-x-2 text-xs text-tinta-suave">
                                <span>
                                  {venta.comprobante} · {formatearFechaHora(venta.fechaHora)}
                                </span>
                                {venta.anulada && (
                                  <span className="rounded-full bg-linea px-2 py-0.5 text-xs font-semibold text-tinta-suave">
                                    Anulada
                                  </span>
                                )}
                              </p>
                              <p className={`truncate text-sm ${venta.anulada ? 'text-tinta-suave' : 'text-tinta/80'}`}>
                                {ETIQUETAS_METODO_PAGO[venta.metodoPago] ?? venta.metodoPago} —{' '}
                                {venta.clienteNombre ?? 'Cliente eventual'}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 text-sm font-semibold ${
                                venta.anulada ? 'text-tinta-suave line-through' : 'text-tinta'
                              }`}
                            >
                              {formatearMonto(venta.total, simboloMoneda)}
                            </span>
                          </button>
                        </li>
                      ))}
                      </ul>
                    )}
                    {pedidosNoAnulados > 0 && (
                      <div className="mt-3 flex items-center justify-between px-1">
                        <span className="text-sm font-semibold text-tinta/70">
                          Total {rangoEsHoy ? 'de hoy' : 'del rango'}
                        </span>
                        <span className="text-base font-extrabold text-tinta">
                          {formatearMonto(totalPedidosDelRango, simboloMoneda)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </section>
          </>
        )}
      </main>

      {ventaDetalle && (
        <DetalleVentaSheet
          venta={ventaDetalle}
          lineas={lineasPorVenta[ventaDetalle.id] ?? []}
          etiquetaPago={ETIQUETAS_METODO_PAGO[ventaDetalle.metodoPago] ?? ventaDetalle.metodoPago}
          simboloMoneda={simboloMoneda}
          esPremium={estadoPlan?.tipo === 'premium'}
          avisoAnulacion={
            contenedor && !ventaDetalle.anulada && ventaDetalle.metodoPago === 'fiado'
              ? avisoAnulacionFiado(contenedor.ventas.obtenerCobradoDeVentaFiada(ventaDetalle.id), simboloMoneda)
              : null
          }
          onEnviarWhatsApp={() => enviarWhatsAppDeVenta(ventaDetalle)}
          onReimprimir={() => abrirMenuTicket(ventaDetalle)}
          onAnular={() => anularVenta(ventaDetalle)}
          onCerrar={() => setVentaDetalle(null)}
          reimprimiendo={imprimiendoVentaId === ventaDetalle.id}
        />
      )}

      {ventaMenuTicket && (
        <MenuImprimirTicket
          imprimirEnTicketeraDisponible={IMPRESION_BLUETOOTH_DISPONIBLE && impresoraActiva}
          onImprimirEnTicketera={imprimirEnTicketeraDesdeMenu}
          onGuardarComo={guardarComoDesdeMenu}
          onCerrar={() => setVentaMenuTicket(null)}
          ocupado={imprimiendoVentaId === ventaMenuTicket.id}
        />
      )}
    </div>
  );
}
