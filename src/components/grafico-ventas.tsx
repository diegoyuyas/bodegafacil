import { alturaRelativa, descripcionDelGrafico, montoCorto, type DiaVentas } from '@/core/ventas-semana';

const ANCHO = 320;
const ALTO = 150;
const MARGEN = 6;
const ANCHO_BARRA = 32;
const BASE_Y = 118;
const ALTO_MAXIMO_BARRA = 82;

/**
 * Gráfico de barras de las ventas de los últimos días (SVG propio, sin librerías). La barra de hoy va en
 * turquesa fuerte; el resto, más suave. Cada barra lleva su monto compacto encima y el día debajo. Los
 * colores salen de las variables de la paleta, así se adaptan al modo oscuro.
 */
export function GraficoVentas({ dias, simboloMoneda }: { dias: DiaVentas[]; simboloMoneda: string }) {
  const maximo = Math.max(0, ...dias.map((d) => d.total));
  const separacion = dias.length > 1 ? (ANCHO - MARGEN * 2 - ANCHO_BARRA * dias.length) / (dias.length - 1) : 0;

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      role="img"
      aria-label={descripcionDelGrafico(dias, simboloMoneda)}
      className="w-full"
    >
      <line x1={0} x2={ANCHO} y1={BASE_Y} y2={BASE_Y} className="stroke-linea" strokeWidth={1} />
      {dias.map((dia, i) => {
        const x = MARGEN + i * (ANCHO_BARRA + separacion);
        const centro = x + ANCHO_BARRA / 2;
        const relativa = alturaRelativa(dia.total, maximo);
        const altura = relativa > 0 ? relativa * ALTO_MAXIMO_BARRA : 2;
        const y = BASE_Y - altura;
        return (
          <g key={dia.fecha}>
            <rect
              x={x}
              y={y}
              width={ANCHO_BARRA}
              height={altura}
              rx={relativa > 0 ? 4 : 1}
              className={relativa === 0 ? 'fill-linea' : dia.esHoy ? 'fill-bodega' : 'fill-bodega/70'}
            />
            {dia.total > 0 && (
              <text
                x={centro}
                y={Math.max(11, y - 5)}
                textAnchor="middle"
                fontSize={10}
                className={dia.esHoy ? 'fill-tinta font-bold' : 'fill-tinta-suave'}
              >
                {montoCorto(dia.total)}
              </text>
            )}
            <text
              x={centro}
              y={ALTO - 8}
              textAnchor="middle"
              fontSize={11}
              className={dia.esHoy ? 'fill-tinta font-bold' : 'fill-tinta-suave'}
            >
              {dia.etiqueta}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
