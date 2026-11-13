'use client';

import { useEffect, useState } from 'react';
import type { FormaVenta, Producto } from '@/core/tipos';
import { factorSugerido } from '@/core/unidades';
import {
  alEscribirPrecioFraccion,
  alSalirPrecioFraccion,
  aUnidadesBase,
  enteroDeTexto,
  precioFraccionSugerido,
  separarEnBase,
  textoPrecioFraccion,
} from '@/core/venta-fraccion';

/** Datos de fracción listos para mandar a productos.crear / productos.actualizar. */
export interface DatosFraccionFormulario {
  formaVenta: 'fraccion';
  unidadEntera: string;
  unidadFraccion: string;
  factorFraccion: number;
  precioFraccion: number;
}

export interface FormularioFraccion {
  formaVenta: FormaVenta;
  setFormaVenta: (forma: FormaVenta) => void;
  unidadEntera: string;
  unidadFraccion: string;
  /** Al elegir las unidades, si el par tiene un valor seguro (Kg → Gramo) "cuántas trae" se rellena solo. */
  cambiarUnidadEntera: (unidad: string) => void;
  cambiarUnidadFraccion: (unidad: string) => void;
  factorTexto: string;
  cambiarFactor: (texto: string) => void;
  /** Cuántas fracciones trae un entero (0 si todavía no se escribió nada válido). */
  factor: number;
  precioFraccionTexto: string;
  /** true mientras el precio de la fracción se calcula solo (precio entero ÷ cuántas trae). */
  precioAutomatico: boolean;
  cambiarPrecioFraccion: (texto: string) => void;
  /** Al salir de la casilla del precio: si quedó vacía, vuelve a calcularse solo. */
  terminarPrecioFraccion: () => void;
  restablecerPrecioAutomatico: () => void;
  stockEnteros: string;
  stockSueltas: string;
  setStockEnteros: (texto: string) => void;
  setStockSueltas: (texto: string) => void;
  minimoEnteros: string;
  minimoSueltas: string;
  setMinimoEnteros: (texto: string) => void;
  setMinimoSueltas: (texto: string) => void;
  /** Unidades distintas, cuántas trae (entero de 2 o más) y precio de la fracción escrito. */
  valido: boolean;
  /** Stock inicial escrito (enteros y sueltas) en la unidad más pequeña. Lanza ErrorDeNegocio si no son números enteros. */
  stockEnUnidadesBase: () => number;
  /** Stock mínimo escrito (enteros y sueltas) en la unidad más pequeña. */
  minimoEnUnidadesBase: () => number;
  datos: () => DatosFraccionFormulario;
  reiniciar: () => void;
  cargarDesdeProducto: (producto: Producto) => void;
}

/**
 * Estado del bloque "Forma de venta" de Nuevo y Editar producto. `precioEnteroTexto` es lo que está escrito en el
 * precio del entero (Precio por Caja): de ahí sale el precio sugerido de la fracción.
 */
export function usarFormularioFraccion(precioEnteroTexto: string): FormularioFraccion {
  const [formaVenta, setFormaVenta] = useState<FormaVenta>('entero');
  const [unidadEntera, setUnidadEntera] = useState('Caja');
  const [unidadFraccion, setUnidadFraccion] = useState('Unidad');
  const [factorTexto, setFactorTexto] = useState('');
  const [precioFraccionTexto, setPrecioFraccionTexto] = useState('');
  const [precioManual, setPrecioManual] = useState(false);
  const [stockEnteros, setStockEnteros] = useState('');
  const [stockSueltas, setStockSueltas] = useState('');
  const [minimoEnteros, setMinimoEnteros] = useState('');
  const [minimoSueltas, setMinimoSueltas] = useState('');

  const factor = enteroDeTexto(factorTexto);

  // Mientras el usuario no cambie el precio de la fracción a mano, se calcula solo.
  useEffect(() => {
    if (precioManual) return;
    setPrecioFraccionTexto(textoPrecioFraccion(precioFraccionSugerido(Number(precioEnteroTexto), factor)));
  }, [precioManual, precioEnteroTexto, factor]);

  function cambiarUnidadEntera(unidad: string) {
    setUnidadEntera(unidad);
    const sugerido = factorSugerido(unidad, unidadFraccion);
    if (sugerido !== null) setFactorTexto(String(sugerido));
  }

  function cambiarUnidadFraccion(unidad: string) {
    setUnidadFraccion(unidad);
    const sugerido = factorSugerido(unidadEntera, unidad);
    if (sugerido !== null) setFactorTexto(String(sugerido));
  }

  function cambiarFactor(texto: string) {
    setFactorTexto(texto.replace(/\D/g, '').replace(/^0+(?=\d)/, ''));
  }

  function cambiarPrecioFraccion(texto: string) {
    // Desde que lo toca, el precio es suyo aunque borre todo para escribir otro número (no se recalcula mientras escribe).
    const estado = alEscribirPrecioFraccion(texto);
    setPrecioFraccionTexto(estado.texto);
    setPrecioManual(estado.manual);
  }

  function terminarPrecioFraccion() {
    // Si sale de la casilla sin nada, vuelve al cálculo automático.
    setPrecioManual(alSalirPrecioFraccion({ texto: precioFraccionTexto, manual: precioManual }).manual);
  }

  const precioFraccion = Number(precioFraccionTexto);
  const valido =
    unidadEntera !== unidadFraccion &&
    Number.isInteger(factor) &&
    factor >= 2 &&
    precioFraccionTexto.trim() !== '' &&
    Number.isFinite(precioFraccion) &&
    precioFraccion >= 0;

  function reiniciar() {
    setFormaVenta('entero');
    setUnidadEntera('Caja');
    setUnidadFraccion('Unidad');
    setFactorTexto('');
    setPrecioFraccionTexto('');
    setPrecioManual(false);
    setStockEnteros('');
    setStockSueltas('');
    setMinimoEnteros('');
    setMinimoSueltas('');
  }

  function cargarDesdeProducto(producto: Producto) {
    reiniciar();
    setFormaVenta(producto.formaVenta);
    if (producto.formaVenta !== 'fraccion' || !producto.factorFraccion) return;
    setUnidadEntera(producto.unidadEntera ?? 'Caja');
    setUnidadFraccion(producto.unidadFraccion ?? 'Unidad');
    setFactorTexto(String(producto.factorFraccion));
    const guardado = producto.precioFraccion ?? 0;
    setPrecioFraccionTexto(textoPrecioFraccion(guardado) || '0');
    setPrecioManual(Math.abs(precioFraccionSugerido(producto.precioVenta, producto.factorFraccion) - guardado) > 1e-9);
    const minimo = separarEnBase(Math.max(0, Math.round(producto.stockMinimo)), producto.factorFraccion);
    setMinimoEnteros(String(minimo.enteros));
    setMinimoSueltas(String(minimo.sueltas));
  }

  return {
    formaVenta,
    setFormaVenta,
    unidadEntera,
    unidadFraccion,
    cambiarUnidadEntera,
    cambiarUnidadFraccion,
    factorTexto,
    cambiarFactor,
    factor,
    precioFraccionTexto,
    precioAutomatico: !precioManual,
    cambiarPrecioFraccion,
    terminarPrecioFraccion,
    restablecerPrecioAutomatico: () => setPrecioManual(false),
    stockEnteros,
    stockSueltas,
    setStockEnteros,
    setStockSueltas,
    minimoEnteros,
    minimoSueltas,
    setMinimoEnteros,
    setMinimoSueltas,
    valido,
    stockEnUnidadesBase: () => aUnidadesBase(enteroDeTexto(stockEnteros), enteroDeTexto(stockSueltas), factor),
    minimoEnUnidadesBase: () => aUnidadesBase(enteroDeTexto(minimoEnteros), enteroDeTexto(minimoSueltas), factor),
    datos: () => ({
      formaVenta: 'fraccion',
      unidadEntera,
      unidadFraccion,
      factorFraccion: factor,
      precioFraccion,
    }),
    reiniciar,
    cargarDesdeProducto,
  };
}
