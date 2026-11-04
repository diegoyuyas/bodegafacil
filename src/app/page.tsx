'use client';

import { useRouter } from 'next/navigation';
import { usarContenedor } from '@/hooks/usar-contenedor';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import type { ResumenDia } from '@/core/tipos';
import { LIMITE_VENTAS_PLAN_GRATIS } from '@/core/plan';
import type { EstadoPlan } from '@/core/plan';
import {
  CLAVE_NOMBRE_TIENDA,
  obtenerNombreTienda,
} from '@/core/configuracion';
import { EsqueletoLista } from '@/components/ui/esqueleto';
import { TarjetaParaHoy } from '@/components/tarjeta-para-hoy';
import { CLAVE_ULTIMO_RESPALDO_MANUAL, construirParaHoy, estadoRespaldo, type PendienteHoy } from '@/core/para-hoy';
import { sumarDias } from '@/core/fiados-compromiso';
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
import { hoyLocalSql } from '@/core/tiempo';
import { useEffect, useRef, useState } from 'react';

/**
 * Pantalla de inicio — resumen del día (sección 7 del documento maestro). La lista de pedidos (antes «Historial
 * de ventas», desplegable aquí) ahora es la pantalla fija «Pedidos» (`/pedidos`, acceso de la barra inferior).
 */

export default function PaginaInicio() {
  const router = useRouter();
  const { contenedor, error, cargando } = usarContenedor();
  const [simboloMoneda, setSimboloMoneda] = useState(obtenerSimboloMoneda(null));
  // El botón "Nueva Venta por Voz" solo aparece con el modo voz en ON y plan Premium.

  useEffect(() => {
    if (!contenedor) return;
    setSimboloMoneda(obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)));
  }, [contenedor]);
  const [resumen, setResumen] = useState<ResumenDia | null>(null);
  const [totalHistorico, setTotalHistorico] = useState(0);
  const [estadoPlan, setEstadoPlan] = useState<EstadoPlan | null>(null);
  const [graficoAbierto, setGraficoAbierto] = useState(false);
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
    setTotalHistorico(contenedor.ventas.contarTotalHistorico());
    const estado = contenedor.plan.obtenerEstado();
    setEstadoPlan(estado);
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

    const configBackup = leerConfigBackupAutomatico(contenedor);
    setParaHoy(
      construirParaHoy({
        productosStockBajo: resumenDelDia.productosStockBajo,
        totalPorCobrar: resumenDelDia.totalPorCobrar,
        respaldo: estadoRespaldo({
          hayDatos: contenedor.ventas.contarTotalHistorico() > 0 || contenedor.productos.listarTodos().length > 0,
          ultimaAuto: configBackup.ultimaFecha,
          ultimoManual: contenedor.configuracion.obtenerValor(CLAVE_ULTIMO_RESPALDO_MANUAL),
          hoy,
        }),
        simboloMoneda: obtenerSimboloMoneda(contenedor.configuracion.obtenerValor(CLAVE_MONEDA)),
      }),
    );
  }

  useEffect(recargar, [contenedor]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col">
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

            {/* Pendientes: lo que requiere atención (fiados vencidos, por cobrar, stock bajo, respaldo), plegado */}
            <section aria-label="Alertas" className="mt-6">
              {paraHoy && <TarjetaParaHoy pendientes={paraHoy} />}
            </section>

            {/* Ventas de los últimos 7 días + producto más vendido de hoy */}
            {diasSemana && (
              <section aria-label="Ventas de los últimos 7 días" className="mt-6">
                {/* Título, texto y «Ver gráfico» dentro de las mismas dos líneas horizontales */}
                <div className="border-y border-linea py-3">
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
                  <button
                    type="button"
                    onClick={() => setGraficoAbierto((v) => !v)}
                    aria-expanded={graficoAbierto}
                    className="mt-2 flex w-full items-center justify-between text-sm font-semibold text-tinta"
                  >
                    <span>Ver gráfico</span>
                    <span className={`text-tinta-suave transition-transform ${graficoAbierto ? 'rotate-180' : ''}`} aria-hidden="true">
                      ⌄
                    </span>
                  </button>
                  {graficoAbierto && (
                    <div className="mt-3">
                      <GraficoVentas dias={diasSemana} simboloMoneda={simboloMoneda} />
                    </div>
                  )}
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
          </>
        )}
      </main>
    </div>
  );
}
