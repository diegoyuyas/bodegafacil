'use client';

import type { FormaVenta } from '@/core/tipos';
import { soloDigitosAlEscribir } from '@/core/texto';
import { NOMBRES_UNIDADES, textoUnidad } from '@/core/unidades';
import { EtiquetaCampo } from '@/components/ventana-formulario';

/**
 * Piezas de Nuevo y Editar producto para la Venta Entero/Fracción (Más > Configuración > Configuración de Venta).
 * Solo dibujan: el estado y las reglas viven en hooks/usar-formulario-fraccion.ts y core/venta-fraccion.ts.
 */

const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** Forma de Venta: Enteros | Fracciones. */
export function SelectorFormaVenta({
  valor,
  onCambiar,
  deshabilitado,
}: {
  valor: FormaVenta;
  onCambiar: (forma: FormaVenta) => void;
  deshabilitado?: boolean;
}) {
  const opciones: { forma: FormaVenta; texto: string }[] = [
    { forma: 'entero', texto: 'Enteros' },
    { forma: 'fraccion', texto: 'Fracciones' },
  ];
  return (
    <div>
      <EtiquetaCampo>Forma de Venta:</EtiquetaCampo>
      <div className="flex gap-2" role="group" aria-label="Forma de venta">
        {opciones.map((opcion) => (
          <button
            key={opcion.forma}
            type="button"
            disabled={deshabilitado}
            aria-pressed={valor === opcion.forma}
            onClick={() => onCambiar(opcion.forma)}
            className={`h-11 flex-1 rounded-lg border text-sm font-semibold disabled:opacity-40 ${
              valor === opcion.forma ? 'border-bodega bg-bodega text-white' : 'border-linea text-tinta/70'
            }`}
          >
            {opcion.texto}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Se vende por [Caja] · Se fracciona en [Unidad] · Cada Caja trae [12] Unidades. */
export function CamposUnidadesFraccion({
  unidadEntera,
  unidadFraccion,
  factorTexto,
  onUnidadEntera,
  onUnidadFraccion,
  onFactor,
}: {
  unidadEntera: string;
  unidadFraccion: string;
  factorTexto: string;
  onUnidadEntera: (unidad: string) => void;
  onUnidadFraccion: (unidad: string) => void;
  onFactor: (texto: string) => void;
}) {
  const factor = Number(factorTexto);
  const iguales = unidadEntera === unidadFraccion;
  return (
    <div className="space-y-3 rounded-xl border border-linea bg-papel p-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <EtiquetaCampo>Se vende por:</EtiquetaCampo>
          <select
            value={unidadEntera}
            onChange={(e) => onUnidadEntera(e.target.value)}
            className="h-11 w-full rounded-lg border border-linea bg-white px-3 text-sm"
          >
            {NOMBRES_UNIDADES.map((nombre) => (
              <option key={nombre} value={nombre}>
                {nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <EtiquetaCampo>Se fracciona en:</EtiquetaCampo>
          <select
            value={unidadFraccion}
            onChange={(e) => onUnidadFraccion(e.target.value)}
            className="h-11 w-full rounded-lg border border-linea bg-white px-3 text-sm"
          >
            {NOMBRES_UNIDADES.map((nombre) => (
              <option key={nombre} value={nombre}>
                {nombre}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <EtiquetaCampo>Cada {unidadEntera} trae:</EtiquetaCampo>
        <div className="flex items-center gap-2">
          <input
            value={factorTexto}
            onChange={(e) => onFactor(soloDigitosAlEscribir(e.target.value))}
            inputMode="numeric"
            placeholder="Ej: 12"
            className="h-11 w-28 rounded-lg border border-linea bg-white px-3 text-sm"
          />
          <span className="text-sm text-tinta-suave">{mayuscula(textoUnidad(unidadFraccion, factor))}</span>
        </div>
      </div>
      {iguales ? (
        <p className="text-xs text-alerta">Elige dos unidades distintas.</p>
      ) : factor >= 2 ? (
        <p className="text-sm font-bold text-bodega-oscuro">
          1 {unidadEntera} = {factor} {mayuscula(textoUnidad(unidadFraccion, factor))}
        </p>
      ) : (
        <p className="text-xs text-tinta-suave">Escribe cuántas trae: un número entero de 2 o más.</p>
      )}
    </div>
  );
}

/** Precio por Unidad: se calcula solo y el usuario lo puede cambiar a mano. */
export function CampoPrecioFraccion({
  unidadFraccion,
  valor,
  automatico,
  onCambiar,
  onTerminar,
  onRestablecer,
}: {
  unidadFraccion: string;
  valor: string;
  automatico: boolean;
  onCambiar: (texto: string) => void;
  /** Al salir de la casilla (si quedó vacía, el precio vuelve a calcularse solo). */
  onTerminar: () => void;
  onRestablecer: () => void;
}) {
  return (
    <div>
      <EtiquetaCampo>Precio por {unidadFraccion}:</EtiquetaCampo>
      <input
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        onBlur={onTerminar}
        inputMode="decimal"
        className="h-11 w-full rounded-lg border border-linea px-3 text-sm"
      />
      <p className="mt-1 text-xs text-tinta-suave">
        {automatico ? (
          'Automático: se calcula solo con el precio del entero. Puedes cambiarlo.'
        ) : (
          <>
            Lo cambiaste a mano.{' '}
            <button type="button" onClick={onRestablecer} className="font-semibold text-bodega-oscuro underline">
              Calcular de nuevo
            </button>
          </>
        )}
      </p>
    </div>
  );
}

/** Dos casillas con su unidad debajo: [ 20 ] Cajas  [ 8 ] Unidades. Para stock inicial, stock mínimo y ajustes. */
export function CampoCantidadFraccion({
  etiqueta,
  unidadEntera,
  unidadFraccion,
  enteros,
  sueltas,
  onEnteros,
  onSueltas,
  deshabilitado,
}: {
  etiqueta: string;
  unidadEntera: string;
  unidadFraccion: string;
  enteros: string;
  sueltas: string;
  onEnteros: (texto: string) => void;
  onSueltas: (texto: string) => void;
  deshabilitado?: boolean;
}) {
  const estiloCasilla =
    'h-11 w-full rounded-lg border border-linea px-3 text-center text-sm disabled:bg-papel disabled:text-tinta/40';
  return (
    <div>
      <EtiquetaCampo>{etiqueta}</EtiquetaCampo>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <input
            value={deshabilitado ? '0' : enteros}
            onChange={(e) => onEnteros(soloDigitosAlEscribir(e.target.value))}
            disabled={deshabilitado}
            inputMode="numeric"
            placeholder="0"
            aria-label={mayuscula(textoUnidad(unidadEntera, 2))}
            className={estiloCasilla}
          />
          <span className="mt-1 block text-center text-xs text-tinta-suave">{mayuscula(textoUnidad(unidadEntera, 2))}</span>
        </div>
        <div>
          <input
            value={deshabilitado ? '0' : sueltas}
            onChange={(e) => onSueltas(soloDigitosAlEscribir(e.target.value))}
            disabled={deshabilitado}
            inputMode="numeric"
            placeholder="0"
            aria-label={mayuscula(textoUnidad(unidadFraccion, 2))}
            className={estiloCasilla}
          />
          <span className="mt-1 block text-center text-xs text-tinta-suave">{mayuscula(textoUnidad(unidadFraccion, 2))}</span>
        </div>
      </div>
    </div>
  );
}
