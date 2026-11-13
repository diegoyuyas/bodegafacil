'use client';

import { useState } from 'react';
import {
  GRAFICO_ANCHO,
  GRAFICO_MARGEN,
  GRAFICO_ALTO_MAXIMO_BARRA,
  GRAFICO_ZONA_MENSAJE,
  alturaRelativa,
  calcularDisposicionGrafico,
  descripcionDelGrafico,
  montoGrafico,
  posicionMensajePedidos,
  textoPedidos,
  type DiaVentas,
} from '@/core/ventas-semana';

/**
 * Gráfico de barras de las ventas (SVG propio, sin librerías): los últimos 7 días o los 12 meses del año. La barra de hoy (o
 * del mes actual) va en turquesa fuerte; el resto, más suave. Cada barra lleva su monto con 2 decimales encima y el día o el
 * mes debajo. Cuando hay muchas barras o montos largos, los montos se escriben de pie para que no se pasen a la barra vecina.
 * Al tocar una barra aparece un mensaje flotante con la cantidad de pedidos de ese día o mes; tocar otra vez (o fuera) lo
 * cierra. Los colores salen de las variables de la paleta, así se adaptan al modo oscuro.
 */
export function GraficoVentas({
  barras,
  simboloMoneda,
  periodo,
}: {
  barras: DiaVentas[];
  simboloMoneda: string;
  periodo: 'dias' | 'meses';
}) {
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const maximo = Math.max(0, ...barras.map((b) => b.total));
  const d = calcularDisposicionGrafico(barras);
  const centroDe = (i: number) => GRAFICO_MARGEN + i * d.casilla + d.anchoBarra / 2;
  const elegida = seleccion !== null ? barras[seleccion] : undefined;

  return (
    <svg
      viewBox={`0 0 ${GRAFICO_ANCHO} ${d.alto}`}
      role="group"
      aria-label={descripcionDelGrafico(barras, simboloMoneda, periodo)}
      className="w-full"
      onClick={() => setSeleccion(null)}
    >
      <line x1={0} x2={GRAFICO_ANCHO} y1={d.baseY} y2={d.baseY} className="stroke-linea" strokeWidth={1} />
      {barras.map((barra, i) => {
        const centro = centroDe(i);
        const x = centro - d.anchoBarra / 2;
        const relativa = alturaRelativa(barra.total, maximo);
        const altura = relativa > 0 ? relativa * GRAFICO_ALTO_MAXIMO_BARRA : 2;
        const y = d.baseY - altura;
        const monto = montoGrafico(barra.total);
        const alternar = () => setSeleccion((actual) => (actual === i ? null : i));
        return (
          <g
            key={barra.fecha}
            role="button"
            tabIndex={0}
            aria-label={`${barra.nombre ?? barra.etiqueta}: ${monto} ${simboloMoneda}, ${textoPedidos(barra.numeroVentas)}`}
            className="cursor-pointer outline-none"
            onClick={(e) => {
              e.stopPropagation();
              alternar();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                alternar();
              }
            }}
          >
            {/* Zona para tocar: toda la columna, no solo la barra (las barras bajas serían difíciles de tocar) */}
            <rect x={centro - d.casilla / 2} y={GRAFICO_ZONA_MENSAJE} width={d.casilla} height={d.alto - GRAFICO_ZONA_MENSAJE} className="fill-transparent" />
            <rect
              x={x}
              y={y}
              width={d.anchoBarra}
              height={altura}
              rx={relativa > 0 ? 4 : 1}
              className={
                relativa === 0 ? 'fill-linea' : seleccion === i ? 'fill-bodega-oscuro' : barra.esHoy ? 'fill-bodega' : 'fill-bodega/70'
              }
            />
            {barra.total > 0 &&
              (d.montosVerticales ? (
                <text
                  x={centro}
                  y={y - 4}
                  transform={`rotate(-90 ${centro} ${y - 4})`}
                  textAnchor="start"
                  dominantBaseline="central"
                  fontSize={d.tamanoMonto}
                  className={barra.esHoy ? 'fill-tinta font-bold' : 'fill-tinta-suave'}
                >
                  {monto}
                </text>
              ) : (
                <text
                  x={centro}
                  y={Math.max(GRAFICO_ZONA_MENSAJE + 10, y - 5)}
                  textAnchor="middle"
                  fontSize={d.tamanoMonto}
                  className={barra.esHoy ? 'fill-tinta font-bold' : 'fill-tinta-suave'}
                >
                  {monto}
                </text>
              ))}
            <text
              x={centro}
              y={d.alto - 10}
              textAnchor="middle"
              fontSize={periodo === 'meses' ? 9 : 11}
              className={barra.esHoy ? 'fill-tinta font-bold' : 'fill-tinta-suave'}
            >
              {barra.etiqueta}
            </text>
          </g>
        );
      })}
      {elegida && seleccion !== null && (
        <MensajePedidos texto={textoPedidos(elegida.numeroVentas)} centro={centroDe(seleccion)} />
      )}
    </svg>
  );
}

/** El mensaje flotante sobre la barra tocada: «3 pedidos». Queda siempre dentro del gráfico. */
function MensajePedidos({ texto, centro }: { texto: string; centro: number }) {
  const { x, ancho, punta } = posicionMensajePedidos(centro, texto);
  return (
    <g pointerEvents="none">
      <rect x={x} y={2} width={ancho} height={22} rx={6} className="fill-tinta" />
      <polygon points={`${punta - 5},24 ${punta + 5},24 ${punta},30`} className="fill-tinta" />
      <text x={x + ancho / 2} y={13} textAnchor="middle" dominantBaseline="central" fontSize={11} className="fill-papel font-bold">
        {texto}
      </text>
    </g>
  );
}
