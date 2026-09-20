'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usarContenedor } from '@/hooks/usar-contenedor';
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
  const [simboloMoneda, setSimboloMoneda] = useState(obtenerSimboloMoneda(null));
  const [prefijoPais, setPrefijoPais] = useState(obtenerPrefijoPais(null));
  const [imprimiendoVentaId, setImprimiendoVentaId] = useState<number | null>(null);
  const [mensajeImpresion, setMensajeImpresion] = useState<string | null>(null);
  const [impresoraActiva, setImpresoraActiva] = useState(false);

  useEffect(() => {
    if (!contenedor) return;
    setSimboloMoneda(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
    setPrefijoPais(obtenerPrefijoPais(contenedor.configuracion.obtenerValor(CLAVE_PREFIJO_PAIS)));
  }, [contenedor]);
  const [resumen, setResumen] = useState<ResumenDia | null>(null);
  const [ventasDeHoy, setVentasDeHoy] = useState<VentaListaItem[]>([]);
  const [totalHistorico, setTotalHistorico] = useState(0);
  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [ventaExpandida, setVentaExpandida] = useState<number | null>(null);
  const [lineasPorVenta, setLineasPorVenta] = useState<Record<number, LineaVentaResumen[]>>({});
  const [pedidosAbiertos, setPedidosAbiertos] = useState(false);
  const [busquedaPedidos, setBusquedaPedidos] = useState('');
  const [nombreTienda, setNombreTienda] = useState(obtenerNombreTienda(null));

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
    setVentasDeHoy(contenedor.ventas.listarDeHoyConDetalle());
    setTotalHistorico(contenedor.ventas.contarTotalHistorico());
    setEstadoPlan(contenedor.plan.obtenerEstado());
    setImpresoraActiva(contenedor.configuracion.obtenerValor(CLAVE_IMPRESORA_ACTIVA) === '1');
    setNombreTienda(obtenerNombreTienda(contenedor.configuracion.obtenerValor(CLAVE_NOMBRE_TIENDA)));
  }

  useEffect(recargar, [contenedor]);

  useEffect(() => {
    if (!pedidosAbiertos || !contenedor) return;
    setLineasPorVenta((actual) => {
      const faltantes = ventasDeHoy.filter((v) => !actual[v.id]);
      if (faltantes.length === 0) return actual;
      const nuevas = { ...actual };
      for (const venta of faltantes) {
        nuevas[venta.id] = contenedor.ventas.obtenerLineas(venta.id);
      }
      return nuevas;
    });
  }, [pedidosAbiertos, contenedor, ventasDeHoy]);

  const pedidosFiltrados = useMemo(() => {
    const texto = busquedaPedidos.trim().toLowerCase();
    if (!texto) return ventasDeHoy;
    return ventasDeHoy.filter((venta) => {
      const nombreCliente = (venta.clienteNombre ?? 'Cliente eventual').toLowerCase();
      if (nombreCliente.includes(texto)) return true;
      if (venta.total.toFixed(2).includes(texto)) return true;
      const lineas = lineasPorVenta[venta.id] ?? [];
      return lineas.some((linea) => linea.producto.toLowerCase().includes(texto));
    });
  }, [ventasDeHoy, busquedaPedidos, lineasPorVenta]);

  function alternarExpandida(venta: VentaListaItem) {
    if (ventaExpandida === venta.id) {
      setVentaExpandida(null);
      return;
    }
    setVentaExpandida(venta.id);
    if (!lineasPorVenta[venta.id] && contenedor) {
      const lineas = contenedor.ventas.obtenerLineas(venta.id);
      setLineasPorVenta((actual) => ({ ...actual, [venta.id]: lineas }));
    }
  }

  async function anularVenta(venta: VentaListaItem, evento: React.MouseEvent) {
    evento.stopPropagation();
    const confirmar = window.confirm(`¿Eliminar el pedido V-${venta.id}?`);
    if (!confirmar || !contenedor) return;
    contenedor.ventas.anularVenta(venta.id);
    await contenedor.persistir();
    recargar();
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
  async function enviarWhatsAppDeVenta(venta: VentaListaItem, evento: React.MouseEvent) {
    evento.stopPropagation();
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

  /** Botón de impresora al lado del de WhatsApp — reimprime el comprobante en la ticketera Bluetooth configurada. */
  async function imprimirVentaDesdeInicio(venta: VentaListaItem, evento: React.MouseEvent) {
    evento.stopPropagation();
    if (!contenedor) return;
    setMensajeImpresion(null);
    setImprimiendoVentaId(venta.id);
    try {
      await imprimirComprobanteDeVenta(contenedor, venta.id);
    } catch {
      setMensajeImpresion('No está correctamente configurada la impresora.');
    } finally {
      setImprimiendoVentaId(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col">
      <header className="flex items-baseline justify-between px-5 pt-6">
        <h1
          onClick={tocarTitulo}
          className="text-lg font-extrabold tracking-tight text-bodega-oscuro select-none"
        >
          {nombreTienda}
        </h1>
        <span className="text-sm text-tinta/60">
          {new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}
        </span>
      </header>

      <main className="flex-1 px-5 pb-40 pt-6">
        {cargando && <p className="text-sm text-tinta/60">Cargando tu bodega…</p>}
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
              <p className="text-sm text-tinta/60">Ventas de hoy</p>
              <p className="mt-1 text-5xl font-extrabold leading-none text-tinta">
                {formatearMonto(resumen.totalVentas, simboloMoneda)}
              </p>
              <p className="mt-2 text-sm text-bodega-oscuro">
                Ganancia estimada {formatearMonto(resumen.gananciaEstimada, simboloMoneda)} ·{' '}
                {resumen.numeroVentas} {resumen.numeroVentas === 1 ? 'venta' : 'ventas'}
              </p>
            </section>

            {/* Desglose por método de pago */}
            <section aria-label="Ventas por método de pago" className="mt-8">
              {resumen.porMetodoPago.length === 0 ? (
                <p className="border-y border-linea py-4 text-sm text-tinta/50">
                  Todavía no registras ventas hoy.
                </p>
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

            {/* Alertas: solo lo que requiere atención hoy */}
            <section aria-label="Alertas" className="mt-6 space-y-3">
              {resumen.productosStockBajo > 0 && (
                <div className="flex items-start gap-3 text-sm">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-alerta" aria-hidden />
                  <p className="text-tinta/80">
                    <span className="font-semibold text-tinta">
                      {resumen.productosStockBajo} productos
                    </span>{' '}
                    con stock bajo
                  </p>
                </div>
              )}
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

            {/* Pedidos de hoy: desplegable con buscador, preview y anular */}
            {ventasDeHoy.length > 0 && (
              <section aria-label="Pedidos de hoy" className="mt-8">
                <button
                  onClick={() => setPedidosAbiertos((v) => !v)}
                  className="flex w-full items-center justify-between border-y border-linea py-3 text-sm font-semibold text-tinta"
                >
                  <span>Pedidos de hoy ({ventasDeHoy.length})</span>
                  <span className={`text-tinta/50 transition-transform ${pedidosAbiertos ? 'rotate-180' : ''}`}>
                    ⌄
                  </span>
                </button>

                {pedidosAbiertos && (
                  <div className="pt-3">
                    <input
                      value={busquedaPedidos}
                      onChange={(e) => setBusquedaPedidos(e.target.value)}
                      placeholder="Buscar por monto, cliente o producto…"
                      className="h-11 w-full rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-bodega"
                    />

                    {mensajeImpresion && <p className="mt-2 text-xs text-alerta">{mensajeImpresion}</p>}

                    {pedidosFiltrados.length === 0 ? (
                      <p className="border-y border-linea py-6 text-center text-sm text-tinta/50 mt-3">
                        Ningún pedido coincide con "{busquedaPedidos}".
                      </p>
                    ) : (
                      <ul className="mt-3 divide-y divide-linea border-y border-linea">
                        {pedidosFiltrados.map((venta) => (
                          <li key={venta.id}>
                            <button
                              onClick={() => alternarExpandida(venta)}
                              className={`flex w-full items-center justify-between py-3 text-left ${
                                venta.anulada ? 'opacity-40' : ''
                              }`}
                            >
                              <div>
                                <p className="text-xs text-tinta/40">V-{venta.id}</p>
                                <p className="text-sm text-tinta/80">
                                  {ETIQUETAS_METODO_PAGO[venta.metodoPago] ?? venta.metodoPago} —{' '}
                                  {venta.clienteNombre ?? 'Cliente eventual'}
                                  {venta.anulada && ' (Anulada)'}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-tinta">
                                  {formatearMonto(venta.total, simboloMoneda)}
                                </span>
                                {!venta.anulada && (
                                  <>
                                    <span
                                      role="button"
                                      onClick={(e) => enviarWhatsAppDeVenta(venta, e)}
                                      className="text-lg text-bodega-oscuro"
                                      aria-label={`Enviar por WhatsApp el pedido V-${venta.id}`}
                                      title="Enviar por WhatsApp"
                                    >
                                      💬
                                    </span>
                                    {IMPRESION_BLUETOOTH_DISPONIBLE &&
                                      estadoPlan?.tipo === 'premium' &&
                                      impresoraActiva && (
                                        <span
                                          role="button"
                                          onClick={(e) => imprimirVentaDesdeInicio(venta, e)}
                                          className={`text-lg text-bodega-oscuro ${imprimiendoVentaId === venta.id ? 'opacity-40' : ''}`}
                                          aria-label={`Reimprimir el pedido V-${venta.id}`}
                                          title="Reimprimir"
                                        >
                                          🖨️
                                        </span>
                                      )}
                                    <span
                                      role="button"
                                      onClick={(e) => anularVenta(venta, e)}
                                      className="text-lg text-alerta"
                                      aria-label={`Anular pedido V-${venta.id}`}
                                    >
                                      🗑
                                    </span>
                                  </>
                                )}
                              </div>
                            </button>

                            {ventaExpandida === venta.id && (
                              <div className="-mt-1 mb-3 rounded-lg bg-bodega-claro/40 px-3 py-2 text-xs text-tinta/70">
                                {(lineasPorVenta[venta.id] ?? []).map((linea, i) => (
                                  <p key={i}>
                                    {linea.cantidad} × {linea.producto}
                                  </p>
                                ))}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* Acción principal, alcanzable con el pulgar (diseño a una mano) */}
      <div className="fixed inset-x-0 bottom-16 z-30 mx-auto max-w-app px-5">
        <Link
          href="/ventas/nueva"
          className="flex h-14 items-center justify-center rounded-full bg-bodega text-base font-semibold text-white shadow-sm active:bg-bodega-oscuro"
        >
          Nueva venta
        </Link>
      </div>

      <BarraNavegacion />
    </div>
  );
}

function BarraNavegacion() {
  const enlaces = [
    { href: '/', etiqueta: 'Inicio', icono: IconoInicio },
    { href: '/productos', etiqueta: 'Productos', icono: IconoProductos },
    { href: '/fiados', etiqueta: 'Fiados', icono: IconoFiados },
    { href: '/mas', etiqueta: 'Más', icono: IconoMas },
  ];

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex h-16 max-w-app border-t border-linea bg-papel"
    >
      {enlaces.map(({ href, etiqueta, icono: Icono }) => (
        <Link
          key={href}
          href={href}
          className="flex flex-1 flex-col items-center justify-center gap-1 text-tinta/60"
        >
          <Icono />
          <span className="text-[11px]">{etiqueta}</span>
        </Link>
      ))}
    </nav>
  );
}

function IconoInicio() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 11.5 12 5l8 6.5M6 10v8.5h4V14h4v4.5h4V10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconoProductos() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M4 8.5 12 13l8-4.5M12 13v7" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function IconoFiados() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 19c0-3.3 3.1-6 7-6s7 2.7 7 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconoMas() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}
