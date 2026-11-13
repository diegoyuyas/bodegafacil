'use client';

import { useState } from 'react';
import { textoUnidad } from '@/core/unidades';
import { procesarEscrituraFraccion, separarEnBase, type ConfiguracionFraccion } from '@/core/venta-fraccion';
import { CasillaNumero } from '@/components/casilla-numero';

const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/**
 * Cantidad de una línea de COMPRA de un producto por fracciones. `cantidad` está en la unidad más pequeña (60 = 5 cajas de 12).
 * Con el interruptor encendido son dos casillas, [Cajas] y [Unidades]: lo escrito se junta y se vuelve a separar ([1] caja y
 * [12] unidades pasan a [2] cajas). Apagado (y si no hay unidades sueltas) es una sola casilla, en cajas. Las casillas muestran
 * lo que se escribe (pueden quedar vacías mientras se escribe otro número).
 */
export function CantidadCompraFraccion({
  fraccion,
  cantidad,
  soloEnteros,
  onCambiar,
}: {
  fraccion: Pick<ConfiguracionFraccion, 'unidadEntera' | 'unidadFraccion' | 'factor'>;
  cantidad: number;
  soloEnteros: boolean;
  onCambiar: (cantidadBase: number) => void;
}) {
  const [borrador, setBorrador] = useState<{ campo: 'enteros' | 'sueltas'; texto: string } | null>(null);
  const partes = separarEnBase(Math.max(0, Math.round(cantidad)), fraccion.factor);
  const estilo = 'mt-1 h-10 w-full rounded-lg border border-linea px-3 text-sm';

  if (soloEnteros) {
    return (
      <label className="flex-1 text-xs text-tinta-suave">
        Cantidad ({textoUnidad(fraccion.unidadEntera, 2)})
        <CasillaNumero
          valor={partes.enteros}
          decimales={false}
          onCambiar={(cajas) => onCambiar(cajas * fraccion.factor)}
          className={estilo}
        />
      </label>
    );
  }

  const escribir = (campo: 'enteros' | 'sueltas', texto: string) => {
    // En una compra no hay tope de stock; la cantidad 0 se deja pasar mientras se escribe (al guardar se pide al menos 1).
    const resultado = procesarEscrituraFraccion(fraccion, Math.max(0, Math.round(cantidad)), Infinity, campo, texto);
    setBorrador({ campo, texto: resultado.texto });
    onCambiar(resultado.cantidad ?? cantidad);
  };
  const casilla = (campo: 'enteros' | 'sueltas', unidad: string) => (
    <label className="flex-1 text-xs text-tinta-suave">
      {mayuscula(textoUnidad(unidad, 2))}
      <input
        type="text"
        inputMode="numeric"
        enterKeyHint="done"
        value={borrador?.campo === campo ? borrador.texto : String(partes[campo])}
        onFocus={(e) => e.target.select()}
        onBlur={() => setBorrador(null)}
        onChange={(e) => escribir(campo, e.target.value)}
        className={estilo}
      />
    </label>
  );
  return (
    <div className="flex flex-1 gap-3">
      {casilla('enteros', fraccion.unidadEntera)}
      {casilla('sueltas', fraccion.unidadFraccion)}
    </div>
  );
}
