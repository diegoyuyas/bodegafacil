'use client';

import { useEffect, useMemo, useState } from 'react';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { usarPermisos } from '@/hooks/usar-permisos';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import type { LineaVentaResumen, VentaListaItem } from '@/core/tipos';
import type { EstadoPlan } from '@/core/plan';
import { CLAVE_NOMBRE_TIENDA, obtenerNombreTienda } from '@/core/configuracion';
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
import { etiquetaMetodoPago, filtrarPedidos, rangoEsHoy, rangoInvalido, resumirPedidos } from '@/core/pedidos';
import { formatearFechaHora, hoyLocalSql } from '@/core/tiempo';

/**
 * Pantalla «Pedidos» (acceso de la barra inferior). Es el antiguo «Historial de ventas» de Inicio, pero fijo (sin
 * desplegar): rango de fechas (por defecto HOY), buscador por cliente, producto, forma de pago o monto, y la lista.
 * Al tocar un pedido se abre su detalle (con WhatsApp, Reimprimir y Anular pedido). El botón flotante
 * «Nueva venta» vive en el layout y aquí siempre está a la vista.
 */
export default function PaginaPedidos() {
  const { contenedor, error, cargando } = usarContenedor();
  const { pedirPermiso, modalPermiso } = usarPermisos(contenedor);
  const [simboloMoneda, setSimboloMoneda] = useState(obtenerSimboloMoneda(null));
  const [prefijoPais, setPrefijoPais] = useState(obtenerPrefijoPais(null));
  const [nombreTienda, setNombreTienda] = useState(obtenerNombreTienda(null));
  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [impresoraActiva, setImpresoraActiva] = useState(false);
  const [imprimiendoVentaId, setImprimiendoVentaId] = useState<number | null>(null);
  const [mensajeImpresion, setMensajeImpresion] = useState<string | null>(null);
  const [ventaMenuTicket, setVentaMenuTicket] = useState<VentaListaItem | null>(null);
  // Pedido cuyo detalle se muestra en el pop-up.
  const [ventaDetalle, setVentaDetalle] = useState<VentaListaItem | null>(null);
  const [pedidosDelRango, setPedidosDelRango] = useState<VentaListaItem[]>([]);
  const [lineasPorVenta, setLineasPorVenta] = useState<Record<number, LineaVentaResumen[]>>({});
  const [busqueda, setBusqueda] = useState('');
  // Por defecto, los pedidos de HOY.
  const [desde, setDesde] = useState(hoyLocalSql());
  const [hasta, setHasta] = useState(hoyLocalSql());

  function recargar() {
    if (!contenedor) return;
    setPedidosDelRango(contenedor.ventas.listarPorRangoConDetalle(desde, hasta));
    setEstadoPlan(contenedor.plan.obtenerEstado());
    setImpresoraActiva(contenedor.configuracion.obtenerValor(CLAVE_IMPRESORA_ACTIVA) === '1');
    setNombreTienda(obtenerNombreTienda(contenedor.configuracion.obtenerValor(CLAVE_NOMBRE_TIENDA)));
    setSimboloMoneda(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
    setPrefijoPais(obtenerPrefijoPais(contenedor.configuracion.obtenerValor(CLAVE_PREFIJO_PAIS)));
  }

  useEffect(recargar, [contenedor, desde, hasta]);

  // Los productos de cada pedido solo se leen cuando se busca (para poder buscar por producto) o al abrir un detalle.
  useEffect(() => {
    if (!contenedor || busqueda.trim() === '') return;
    setLineasPorVenta((actual) => {
      const faltantes = pedidosDelRango.filter((v) => !actual[v.id]);
      if (faltantes.length === 0) return actual;
      const nuevas = { ...actual };
      for (const venta of faltantes) nuevas[venta.id] = contenedor.ventas.obtenerLineas(venta.id);
      return nuevas;
    });
  }, [busqueda, contenedor, pedidosDelRango]);

  const pedidosFiltrados = useMemo(
    () => filtrarPedidos(pedidosDelRango, lineasPorVenta, busqueda),
    [pedidosDelRango, lineasPorVenta, busqueda],
  );

  const resumen = resumirPedidos(pedidosDelRango);
  const esHoy = rangoEsHoy(desde, hasta, hoyLocalSql());
  const fechasInvalidas = rangoInvalido(desde, hasta);

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
    const cobrado = venta.metodoPago === 'fiado' ? contenedor.ventas.obtenerCobradoDeVentaFiada(venta.id) : 0;
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
   * Reenvía el detalle de un pedido ya confirmado por WhatsApp: prioriza el teléfono del cliente registrado; si no
   * tiene, o si es cliente eventual, usa el teléfono que haya quedado guardado en la propia venta. Si tampoco hay
   * uno guardado, lo pide en el momento y lo guarda en la venta para no volver a pedirlo. Nunca envía automático:
   * solo abre wa.me con el mensaje ya escrito, el usuario presiona «Enviar».
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

  /** «Reimprimir» del detalle: abre el menú «Imprimir en ticketera / Guardar como...» para reconstruir el ticket. */
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
      <header className="px-5 pt-6">
        <h1 className="text-lg font-extrabold tracking-tight text-bodega-oscuro">Pedidos</h1>
        <p className="mt-0.5 text-sm text-tinta-suave">
          {esHoy ? 'Hoy' : 'Total'}: {resumen.cantidad} {resumen.cantidad === 1 ? 'pedido' : 'pedidos'}
        </p>
      </header>

      {/* pb: deja libre el botón flotante «Nueva venta» (vive en el layout: 72 px + 16 px sobre la barra) para que no tape el último pedido */}
      <main className="flex-1 px-5 pb-[calc(10.5rem+var(--area-segura-abajo))] pt-4">
        {cargando && <EsqueletoLista filas={3} />}
        {error && <p className="text-sm text-alerta">No se pudo abrir la base de datos local: {error.message}</p>}

        {contenedor && (
          <>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-tinta-suave">Desde</label>
                <input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  max={hasta}
                  className="h-11 w-full rounded-lg border border-linea px-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-tinta-suave">Hasta</label>
                <input
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  min={desde}
                  className="h-11 w-full rounded-lg border border-linea px-2 text-sm"
                />
              </div>
              {!esHoy && (
                <button
                  type="button"
                  onClick={() => {
                    setDesde(hoyLocalSql());
                    setHasta(hoyLocalSql());
                  }}
                  className="mt-6 h-11 shrink-0 rounded-lg border border-linea px-3 text-xs font-semibold text-tinta-suave"
                >
                  Hoy
                </button>
              )}
            </div>
            {fechasInvalidas && (
              <p className="mt-2 text-xs text-alerta">La fecha "desde" no puede ser posterior a "hasta".</p>
            )}
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente, producto, pago o monto…"
              className="mt-3 h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
            />

            {mensajeImpresion && <p className="mt-2 text-xs text-alerta">{mensajeImpresion}</p>}

            {pedidosDelRango.length === 0 ? (
              <p className="mt-3 border-y border-linea py-6 text-center text-sm text-tinta-suave">
                {esHoy ? 'Todavía no tienes pedidos hoy.' : 'No hay pedidos en este rango de fechas.'}
              </p>
            ) : pedidosFiltrados.length === 0 ? (
              <p className="mt-3 border-y border-linea py-6 text-center text-sm text-tinta-suave">
                Ningún pedido coincide con "{busqueda}".
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
                          {etiquetaMetodoPago(venta.metodoPago)} — {venta.clienteNombre ?? 'Cliente eventual'}
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

            {resumen.cantidad > 0 && (
              <div className="mt-3 flex items-center justify-between px-1">
                <span className="text-sm font-semibold text-tinta/70">Total {esHoy ? 'de hoy' : 'del rango'}</span>
                <span className="text-base font-extrabold text-tinta">{formatearMonto(resumen.total, simboloMoneda)}</span>
              </div>
            )}
          </>
        )}
      </main>

      {ventaDetalle && (
        <DetalleVentaSheet
          venta={ventaDetalle}
          lineas={lineasPorVenta[ventaDetalle.id] ?? []}
          etiquetaPago={etiquetaMetodoPago(ventaDetalle.metodoPago)}
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
