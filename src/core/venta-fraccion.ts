/**
 * Vende Fácil — Venta Entero/Fracción (lógica pura)
 * ------------------------------------------------------------
 * Un producto con forma de venta "Fracciones" se vende en dos unidades: la ENTERA (Caja, Kg) y la FRACCIÓN
 * (Unidad, Gramo). `factor` = cuántas fracciones trae un entero (12 galletas por caja, 1000 g por kg).
 *
 * Regla de almacenamiento: el stock y las cantidades se llevan en la unidad MÁS PEQUEÑA y como número ENTERO
 * ("base"). 20 cajas y 8 galletas = 248 galletas. Así no hay decimales raros (8/12 de caja) ni errores al sumar.
 * Solo al mostrar o al escribir se separa en "N cajas y N unidades".
 *
 * Una venta o compra de "1 caja y 8 galletas" se guarda como DOS líneas del mismo producto (una en cajas y otra en
 * galletas), cada una con su unidad, su precio y su subtotal. Cada línea guarda `factorStock`: cuántas unidades base
 * mueve UNA unidad de esa línea (12 para la caja, 1 para la galleta). Con eso el stock se descuenta y se devuelve
 * (al anular) siempre bien, aunque después se cambie el factor del producto.
 *
 * Esta etapa solo trae las reglas; todavía ninguna pantalla las usa.
 */

import {
  ErrorDeNegocio,
  calcularGananciaLinea,
  calcularSubtotalLinea,
  construirDetalleVenta,
  redondear,
  validarMontoMinimoVenta,
  validarPrecioUnitario,
} from './reglas-negocio';
import { limpiarDecimalEscrito } from './texto';
import { buscarUnidad, esUnidadValida, textoUnidad } from './unidades';
import type { LineaCompraEntrada } from './repositorios';
import type { DetalleVenta, FormaVenta, LineaVentaEntrada, Producto, VentaCalculada } from './tipos';

export interface ConfiguracionFraccion {
  unidadEntera: string;
  unidadFraccion: string;
  /** Cuántas fracciones trae un entero. Entero ≥ 2. */
  factor: number;
  precioEntero: number;
  precioFraccion: number;
  /** Costo de UN entero (de la caja). El costo de una fracción es costoEntero ÷ factor. */
  costoEntero: number;
}

/** Una línea lista para guardar en detalle_venta / detalle_compra. */
export interface LineaFraccion {
  unidad: string;
  cantidad: number;
  /** Cuántas unidades base mueve una unidad de esta línea (factor para el entero, 1 para la fracción). */
  factorStock: number;
  precioUnitario: number;
  costoUnitario: number;
  subtotal: number;
  gananciaLinea: number;
}

export interface CantidadSeparada {
  enteros: number;
  sueltas: number;
}

// ------------------------------------------------------------
// Forma de venta efectiva
// ------------------------------------------------------------

/**
 * ÚNICO punto que decide cómo se vende un producto: "fraccion" solo si el producto es de Fracciones **y** el
 * interruptor "Activar Venta Entero/Fracción" está en ON. Con el interruptor apagado, todo se vende en enteros.
 */
export function formaVentaEfectiva(formaVentaDelProducto: FormaVenta, interruptorActivo: boolean): FormaVenta {
  return interruptorActivo && formaVentaDelProducto === 'fraccion' ? 'fraccion' : 'entero';
}

/**
 * Datos de fracción de un producto, o null si hay que venderlo como entero (forma Entero, interruptor apagado o
 * datos de fracción incompletos).
 */
export function configuracionFraccionDeProducto(
  producto: Pick<
    Producto,
    'formaVenta' | 'unidadEntera' | 'unidadFraccion' | 'factorFraccion' | 'precioFraccion' | 'precioVenta' | 'costo'
  >,
  interruptorActivo: boolean,
): ConfiguracionFraccion | null {
  if (formaVentaEfectiva(producto.formaVenta, interruptorActivo) !== 'fraccion') return null;
  const { unidadEntera, unidadFraccion, factorFraccion, precioFraccion } = producto;
  if (!unidadEntera || !unidadFraccion || !factorFraccion || factorFraccion < 2 || precioFraccion === null) return null;
  return {
    unidadEntera,
    unidadFraccion,
    factor: factorFraccion,
    precioEntero: producto.precioVenta,
    precioFraccion,
    costoEntero: producto.costo,
  };
}

// ------------------------------------------------------------
// Validación al crear / editar un producto
// ------------------------------------------------------------

export function validarConfiguracionFraccion(datos: {
  unidadEntera: string | null | undefined;
  unidadFraccion: string | null | undefined;
  factor: number | null | undefined;
  precioFraccion: number | null | undefined;
}): void {
  if (!esUnidadValida(datos.unidadEntera)) {
    throw new ErrorDeNegocio('Elige en qué unidad se vende el producto entero (por ejemplo, Caja).');
  }
  if (!esUnidadValida(datos.unidadFraccion)) {
    throw new ErrorDeNegocio('Elige en qué unidad se fracciona el producto (por ejemplo, Unidad).');
  }
  if (buscarUnidad(datos.unidadEntera)?.nombre === buscarUnidad(datos.unidadFraccion)?.nombre) {
    throw new ErrorDeNegocio('La unidad entera y la fracción tienen que ser distintas.');
  }
  const factor = datos.factor;
  if (typeof factor !== 'number' || !Number.isInteger(factor) || factor < 2) {
    throw new ErrorDeNegocio('Escribe cuántas trae cada uno: un número entero de 2 o más.');
  }
  const precio = datos.precioFraccion;
  if (typeof precio !== 'number' || !Number.isFinite(precio) || precio < 0) {
    throw new ErrorDeNegocio('El precio de la fracción no puede ser negativo.');
  }
}

// ------------------------------------------------------------
// Conversión entre "N enteros y N sueltas" y unidades base
// ------------------------------------------------------------

function exigirEnteroNoNegativo(valor: number, mensaje: string): void {
  if (!Number.isInteger(valor) || valor < 0) throw new ErrorDeNegocio(mensaje);
}

/** Pasa "enteros y sueltas" a unidades base. 1 caja y 8 galletas (factor 12) = 20. Solo acepta números enteros. */
export function aUnidadesBase(enteros: number, sueltas: number, factor: number): number {
  const mensaje = 'Escribe solo números enteros, sin decimales.';
  exigirEnteroNoNegativo(enteros, mensaje);
  exigirEnteroNoNegativo(sueltas, mensaje);
  return enteros * factor + sueltas;
}

/** Separa unidades base en enteros y sueltas. 20 galletas (factor 12) = 1 caja y 8 galletas. */
export function separarEnBase(totalBase: number, factor: number): CantidadSeparada {
  exigirEnteroNoNegativo(totalBase, 'La cantidad no puede ser negativa ni tener decimales.');
  return { enteros: Math.floor(totalBase / factor), sueltas: totalBase % factor };
}

/** Reconvierte lo que escribió el usuario: [1] caja y [12] galletas (factor 12) → 2 cajas y 0 galletas. */
export function normalizarCantidad(enteros: number, sueltas: number, factor: number): CantidadSeparada {
  return separarEnBase(aUnidadesBase(enteros, sueltas, factor), factor);
}

/**
 * Stock de un producto que ya existía en enteros (puede tener decimales, ej. 2.5 kg) a unidades base.
 * 20 cajas (factor 12) → 240; 2.5 kg (factor 1000) → 2500.
 */
export function convertirStockEnteroABase(stockEntero: number, factor: number): number {
  return Math.round(stockEntero * factor);
}

// ------------------------------------------------------------
// Precios y costos
// ------------------------------------------------------------

/**
 * Precio sugerido de una fracción = precio entero ÷ factor. Con 2 decimales; si sale menor a S/ 0.10 (gramos,
 * mililitros) con hasta 6, para no cambiar el precio (S/ 4.50 el kg son S/ 0.0045 el gramo, no 0.005).
 * Es solo una sugerencia: el usuario lo puede cambiar.
 */
export function precioFraccionSugerido(precioEntero: number, factor: number): number {
  if (!Number.isFinite(precioEntero) || precioEntero <= 0 || !Number.isFinite(factor) || factor <= 0) return 0;
  const bruto = precioEntero / factor;
  const decimales = bruto >= 0.1 ? 2 : 6;
  const potencia = 10 ** decimales;
  return Math.round((bruto + Number.EPSILON) * potencia) / potencia;
}

/** Costo de UNA fracción = costo del entero ÷ factor (sin redondear a centavos; solo se quita el ruido decimal). */
export function costoPorFraccion(costoEntero: number, factor: number): number {
  if (!Number.isFinite(costoEntero) || costoEntero <= 0 || !Number.isFinite(factor) || factor <= 0) return 0;
  return Math.round((costoEntero / factor) * 1_000_000) / 1_000_000;
}

// ------------------------------------------------------------
// Líneas de venta y de compra
// ------------------------------------------------------------

/**
 * Líneas de VENTA para una cantidad total en unidades base. Primero se normaliza (12 galletas son 1 caja) y luego se
 * cobra: enteros × precio del entero + sueltas × precio de la fracción. Una línea con cantidad 0 no se crea.
 */
export function construirLineasVentaFraccion(config: ConfiguracionFraccion, totalBase: number): LineaFraccion[] {
  const { enteros, sueltas } = separarEnBase(totalBase, config.factor);
  const costoFraccion = costoPorFraccion(config.costoEntero, config.factor);
  const lineas: LineaFraccion[] = [];
  if (enteros > 0) {
    lineas.push({
      unidad: config.unidadEntera,
      cantidad: enteros,
      factorStock: config.factor,
      precioUnitario: config.precioEntero,
      costoUnitario: config.costoEntero,
      subtotal: calcularSubtotalLinea(config.precioEntero, enteros),
      gananciaLinea: calcularGananciaLinea(config.precioEntero, config.costoEntero, enteros),
    });
  }
  if (sueltas > 0) {
    lineas.push({
      unidad: config.unidadFraccion,
      cantidad: sueltas,
      factorStock: 1,
      precioUnitario: config.precioFraccion,
      costoUnitario: costoFraccion,
      subtotal: calcularSubtotalLinea(config.precioFraccion, sueltas),
      gananciaLinea: calcularGananciaLinea(config.precioFraccion, costoFraccion, sueltas),
    });
  }
  return lineas;
}

/**
 * Líneas de COMPRA para una cantidad total en unidades base: el entero se compra a su costo y la fracción a
 * costo del entero ÷ factor. (En una compra no hay precio de venta: ganancia 0.)
 */
export function construirLineasCompraFraccion(
  config: Pick<ConfiguracionFraccion, 'unidadEntera' | 'unidadFraccion' | 'factor' | 'costoEntero'>,
  totalBase: number,
): LineaFraccion[] {
  const { enteros, sueltas } = separarEnBase(totalBase, config.factor);
  const costoFraccion = costoPorFraccion(config.costoEntero, config.factor);
  const lineas: LineaFraccion[] = [];
  if (enteros > 0) {
    lineas.push({
      unidad: config.unidadEntera,
      cantidad: enteros,
      factorStock: config.factor,
      precioUnitario: 0,
      costoUnitario: config.costoEntero,
      subtotal: calcularSubtotalLinea(config.costoEntero, enteros),
      gananciaLinea: 0,
    });
  }
  if (sueltas > 0) {
    lineas.push({
      unidad: config.unidadFraccion,
      cantidad: sueltas,
      factorStock: 1,
      precioUnitario: 0,
      costoUnitario: costoFraccion,
      subtotal: calcularSubtotalLinea(costoFraccion, sueltas),
      gananciaLinea: 0,
    });
  }
  return lineas;
}

/** Unidades base que mueve una línea guardada: cantidad × factorStock (para descontar o devolver stock). */
export function unidadesBaseDeLinea(cantidad: number, factorStock: number): number {
  return Math.round(cantidad * factorStock);
}

// ------------------------------------------------------------
// Textos y stock
// ------------------------------------------------------------

/** "20 cajas y 8 unidades", "1 caja", "8 unidades", "0 cajas". */
export function textoCantidadFraccion(
  totalBase: number,
  config: Pick<ConfiguracionFraccion, 'unidadEntera' | 'unidadFraccion' | 'factor'>,
): string {
  const { enteros, sueltas } = separarEnBase(Math.max(0, Math.round(totalBase)), config.factor);
  const textoEnteros = `${enteros} ${textoUnidad(config.unidadEntera, enteros)}`;
  const textoSueltas = `${sueltas} ${textoUnidad(config.unidadFraccion, sueltas)}`;
  if (enteros > 0 && sueltas > 0) return `${textoEnteros} y ${textoSueltas}`;
  if (sueltas > 0) return textoSueltas;
  return textoEnteros;
}

/**
 * Comprueba que alcance el stock (en unidades base). Cuenta el total: vender 8 galletas con una caja cerrada y
 * ninguna suelta es válido (la caja se "abre" sola).
 */
export function verificarStockFraccion(
  nombreProducto: string,
  stockBase: number,
  pedidoBase: number,
  config: Pick<ConfiguracionFraccion, 'unidadEntera' | 'unidadFraccion' | 'factor'>,
): void {
  if (pedidoBase <= 0) {
    throw new ErrorDeNegocio(`La cantidad debe ser mayor a cero (producto: ${nombreProducto}).`);
  }
  if (stockBase < pedidoBase) {
    throw new ErrorDeNegocio(
      `Stock insuficiente de "${nombreProducto}". Disponible: ${textoCantidadFraccion(stockBase, config)}, pedido: ${textoCantidadFraccion(pedidoBase, config)}.`,
    );
  }
}

// ------------------------------------------------------------
// Cambio de forma de venta (Entero ↔ Fracciones) y formularios
// ------------------------------------------------------------

/** Un producto Entero que pasa a Fracciones: su stock y su mínimo se multiplican por el factor (20 cajas → 240 unidades). */
export function convertirAFracciones(stock: number, minimo: number, factor: number): { stock: number; minimo: number } {
  return { stock: convertirStockEnteroABase(stock, factor), minimo: convertirStockEnteroABase(minimo, factor) };
}

/**
 * Un producto de Fracciones que vuelve a Entero: el stock se divide por el factor. Si hay unidades sueltas
 * (1 caja y 8 unidades) no se puede, para no perder stock: hay que dejarlo en enteros completos con un Ajuste.
 * El stock mínimo (solo un aviso) se redondea hacia arriba al entero siguiente.
 */
export function convertirAEntero(
  stockBase: number,
  minimoBase: number,
  config: Pick<ConfiguracionFraccion, 'unidadEntera' | 'unidadFraccion' | 'factor'>,
): { stock: number; minimo: number } {
  const { enteros, sueltas } = separarEnBase(Math.max(0, Math.round(stockBase)), config.factor);
  if (sueltas > 0) {
    throw new ErrorDeNegocio(
      `No se puede volver a Entero: el stock es ${textoCantidadFraccion(stockBase, config)}. Déjalo en ${textoUnidad(config.unidadEntera, 2)} completas con un Ajuste de stock.`,
    );
  }
  return { stock: enteros, minimo: Math.ceil(Math.max(0, minimoBase) / config.factor) };
}

/** Lo que se escribió en una casilla de solo números ("" = 0). */
export function enteroDeTexto(texto: string): number {
  const limpio = texto.trim();
  return limpio === '' ? 0 : Number(limpio);
}

/** El precio de una fracción como texto para una casilla ("" si no hay precio todavía). */
export function textoPrecioFraccion(precio: number): string {
  return Number.isFinite(precio) && precio > 0 ? String(precio) : '';
}

/** Precio de una fracción para mostrar: 2 decimales y, si es menor a 0.10 (gramos, mililitros), todos los que tenga (S/ 0.008). */
export function formatearPrecioFraccion(precio: number, simbolo: string): string {
  return precio >= 0.1 || precio === 0 ? `${simbolo} ${precio.toFixed(2)}` : `${simbolo} ${String(precio)}`;
}

// ------------------------------------------------------------
// Armar una venta con productos por fracciones
// ------------------------------------------------------------

/** Una venta calculada, con la línea de entrada de la que salió cada detalle (una entrada por fracciones da 1 o 2 detalles). */
export interface VentaCalculadaFraccion extends VentaCalculada {
  /** origen[i] = posición, en las líneas de entrada, de la que salió detalles[i]. */
  origen: number[];
}

/**
 * Detalles (1 o 2) de UNA línea de venta. Producto Entero: igual que siempre (construirDetalleVenta). Producto por
 * fracciones: con el interruptor encendido, `cantidad` es el total en unidades base y sale una línea de enteros y otra de
 * fracciones; con el interruptor apagado, `cantidad` son enteros completos (no se parte ninguno).
 */
export function construirDetallesDeLinea(
  producto: Producto,
  linea: LineaVentaEntrada,
  interruptorActivo: boolean,
): Omit<DetalleVenta, 'id' | 'ventaId'>[] {
  if (producto.formaVenta !== 'fraccion') {
    return [{ ...construirDetalleVenta(producto, linea.cantidad, linea.precioUnitario), unidad: null, factorStock: 1 }];
  }

  // El stock de estos productos está en la unidad más pequeña: sin sus datos completos no se puede vender sin descuadrarlo.
  const config = configuracionFraccionDeProducto(producto, true);
  if (!config) {
    throw new ErrorDeNegocio(`Los datos de fracción de "${producto.nombre}" están incompletos. Edítalo en Productos.`);
  }
  const cantidad = linea.cantidad;

  if (!interruptorActivo) {
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new ErrorDeNegocio(
        `"${producto.nombre}" se vende solo en ${textoUnidad(config.unidadEntera, 2)} completas mientras la venta por fracciones esté apagada.`,
      );
    }
    if (producto.controlaStock && producto.stockActual < cantidad * config.factor) {
      throw new ErrorDeNegocio(
        `Stock insuficiente de "${producto.nombre}". Disponible: ${textoCantidadFraccion(producto.stockActual, config)}, solicitado: ${cantidad} ${textoUnidad(config.unidadEntera, cantidad)}.`,
      );
    }
    if (linea.precioUnitario !== undefined) validarPrecioUnitario(linea.precioUnitario, producto.nombre);
    const precio = linea.precioUnitario ?? producto.precioVenta;
    return [
      {
        productoId: producto.id,
        cantidad,
        precioUnitario: precio,
        costoUnitario: producto.costo,
        subtotal: calcularSubtotalLinea(precio, cantidad),
        gananciaLinea: calcularGananciaLinea(precio, producto.costo, cantidad),
        unidad: config.unidadEntera,
        factorStock: config.factor,
      },
    ];
  }

  if (cantidad === 0) {
    throw new ErrorDeNegocio(
      `Pon al menos 1 ${textoUnidad(config.unidadEntera, 1)} o 1 ${textoUnidad(config.unidadFraccion, 1)} de "${producto.nombre}".`,
    );
  }
  if (!Number.isInteger(cantidad) || cantidad < 0) {
    throw new ErrorDeNegocio(`La cantidad debe ser un número entero mayor a cero (producto: ${producto.nombre}).`);
  }
  if (producto.controlaStock) verificarStockFraccion(producto.nombre, producto.stockActual, cantidad, config);
  // El precio es el de la lista (un precioUnitario escrito se ignora). Solo se cambia con subtotalEditado: lo que se quiere
  // cobrar por toda la línea, repartido en proporción entre las cajas y las unidades.
  let configuracionDeVenta = config;
  if (linea.subtotalEditado !== undefined) {
    if (!Number.isFinite(linea.subtotalEditado) || linea.subtotalEditado < 0) {
      throw new ErrorDeNegocio(`El subtotal no puede ser negativo (producto: ${producto.nombre}).`);
    }
    configuracionDeVenta = { ...config, ...repartirSubtotalFraccion(config, cantidad, linea.subtotalEditado) };
  }
  return construirLineasVentaFraccion(configuracionDeVenta, cantidad).map((l) => ({
    productoId: producto.id,
    cantidad: l.cantidad,
    precioUnitario: l.precioUnitario,
    costoUnitario: l.costoUnitario,
    subtotal: l.subtotal,
    gananciaLinea: l.gananciaLinea,
    unidad: l.unidad,
    factorStock: l.factorStock,
  }));
}

/** Como construirVenta, pero entiende los productos por fracciones. */
export function construirVentaFraccion(
  lineas: LineaVentaEntrada[],
  obtenerProducto: (productoId: number) => Producto,
  interruptorActivo: boolean,
): VentaCalculadaFraccion {
  if (lineas.length === 0) {
    throw new ErrorDeNegocio('Una venta debe tener al menos un producto.');
  }
  const detalles: DetalleVenta[] = [];
  const origen: number[] = [];
  lineas.forEach((linea, indice) => {
    for (const detalle of construirDetallesDeLinea(obtenerProducto(linea.productoId), linea, interruptorActivo)) {
      detalles.push({ ...detalle, id: 0, ventaId: 0 }); // ids reales los asigna el repositorio al guardar
      origen.push(indice);
    }
  });
  const subtotal = redondear(detalles.reduce((acumulado, d) => acumulado + d.subtotal, 0));
  const gananciaEstimada = redondear(detalles.reduce((acumulado, d) => acumulado + d.gananciaLinea, 0));
  // Ninguna venta puede quedar por debajo de 0.10 (aunque el subtotal de un producto se haya editado a 0.01).
  validarMontoMinimoVenta(subtotal);
  return { detalles, subtotal, total: subtotal, gananciaEstimada, origen };
}

/** Subtotal de una línea de entrada ya armada: la suma de sus detalles (para mostrarlo en el carrito). */
export function subtotalDeLineaFraccion(config: ConfiguracionFraccion, totalBase: number, subtotalEditado?: number): number {
  if (subtotalEditado !== undefined && totalBase > 0) return redondear(subtotalEditado);
  return redondear(construirLineasVentaFraccion(config, totalBase).reduce((suma, l) => suma + l.subtotal, 0));
}

/**
 * Los precios que hacen que una línea por fracciones cobre `subtotalDeseado` en total. Con cajas Y unidades se cambian los
 * dos precios en la misma proporción (descuento parejo) y la línea de unidades absorbe el último céntimo para que la suma dé
 * justo ese monto. Con solo cajas o solo unidades, el precio es subtotal ÷ cantidad, como en un producto normal.
 */
export function repartirSubtotalFraccion(
  config: ConfiguracionFraccion,
  totalBase: number,
  subtotalDeseado: number,
): { precioEntero: number; precioFraccion: number } {
  const { enteros, sueltas } = separarEnBase(totalBase, config.factor);
  const objetivo = redondear(subtotalDeseado);
  if (enteros > 0 && sueltas === 0) return { precioEntero: objetivo / enteros, precioFraccion: config.precioFraccion };
  if (sueltas > 0 && enteros === 0) return { precioEntero: config.precioEntero, precioFraccion: objetivo / sueltas };
  if (enteros === 0 && sueltas === 0) return { precioEntero: config.precioEntero, precioFraccion: config.precioFraccion };

  const lista = enteros * config.precioEntero + sueltas * config.precioFraccion;
  let precioEntero = lista > 0 ? config.precioEntero * (objetivo / lista) : objetivo / enteros;
  let subtotalEnteros = redondear(enteros * precioEntero);
  if (subtotalEnteros > objetivo) {
    subtotalEnteros = objetivo;
    precioEntero = objetivo / enteros;
  }
  const resto = redondear(objetivo - subtotalEnteros);
  return { precioEntero, precioFraccion: resto / sueltas };
}

// ------------------------------------------------------------
// Escribir la cantidad en las dos casillas (cajas y unidades) de Nueva venta
// ------------------------------------------------------------

export interface ResultadoEscrituraFraccion {
  /** La cantidad nueva en unidades base (0 si las dos casillas quedaron en 0: no se puede cobrar así). */
  cantidad: number | null;
  /** Aviso para mostrar bajo la línea (mínimo 1, o tope de stock), o null. */
  aviso: string | null;
  /** Lo que debe mostrar la casilla que se está escribiendo ("" mientras el usuario la deja vacía para escribir otra). */
  texto: string;
}

/**
 * Qué pasa cuando el usuario escribe en una de las dos casillas. Se juntan las dos en unidades base y se vuelven a
 * separar: [1] caja y [12] unidades pasan solas a [2] cajas y [0] unidades. La cantidad nunca pasa del stock
 * (`stockDisponible` en unidades base, Infinity si no se controla).
 */
export function procesarEscrituraFraccion(
  config: Pick<ConfiguracionFraccion, 'unidadEntera' | 'unidadFraccion' | 'factor'>,
  cantidadActual: number,
  stockDisponible: number,
  campo: 'enteros' | 'sueltas',
  textoTipeado: string,
): ResultadoEscrituraFraccion {
  const soloDigitos = textoTipeado.replace(/\D/g, '').slice(0, 6).replace(/^0+(?=\d)/, '');
  const actuales = separarEnBase(cantidadActual, config.factor);
  const escrito = soloDigitos === '' ? 0 : Number(soloDigitos);
  const enteros = campo === 'enteros' ? escrito : actuales.enteros;
  const sueltas = campo === 'sueltas' ? escrito : actuales.sueltas;
  const total = enteros * config.factor + sueltas;

  if (total <= 0) {
    // Las dos casillas en 0 se permiten como paso intermedio (así se llega a [0] [1] escribiendo en cualquier orden), pero
    // la venta no se puede cobrar hasta que alguna casilla tenga 1 o más.
    return {
      cantidad: 0,
      aviso: soloDigitos === '' ? null : 'Pon al menos 1 en alguna casilla.',
      texto: soloDigitos === '' ? '' : '0',
    };
  }
  const cantidad = Math.min(total, stockDisponible);
  const nuevas = separarEnBase(cantidad, config.factor);
  return {
    cantidad,
    aviso: cantidad < total ? `Solo hay ${textoCantidadFraccion(stockDisponible, config)} en stock.` : null,
    texto: soloDigitos === '' ? '' : String(campo === 'enteros' ? nuevas.enteros : nuevas.sueltas),
  };
}

// ------------------------------------------------------------
// Compras de productos por fracciones
// ------------------------------------------------------------

/** Una línea de compra lista para guardar (1 o 2 por cada producto por fracciones). */
export interface LineaCompraArmada {
  productoId: number;
  cantidad: number;
  costoUnitario: number;
  descripcion?: string | null;
  unidad: string | null;
  /** Unidades de stock que mueve UNA unidad de esta línea (12 la caja, 1 la fracción). */
  factorStock: number;
  /** Costo del producto (por entero) que deja esta línea: el producto se queda con el último costo comprado. */
  costoProducto: number;
  /** Posición, en las líneas de entrada, de la que salió. */
  origen: number;
}

/**
 * Líneas de compra a guardar. Producto Entero (o insumo): igual que siempre. Producto por fracciones: `cantidad` es el
 * total en unidades base y `costoUnitario` el costo de UN entero; sale una línea de enteros (a ese costo) y otra de
 * fracciones (a costo ÷ factor). No depende del interruptor: comprar solo cajas es solo un caso (60 unidades = 5 cajas).
 */
export function armarLineasDeCompra(
  lineas: LineaCompraEntrada[],
  obtenerProducto: (productoId: number) => Producto,
): LineaCompraArmada[] {
  const armadas: LineaCompraArmada[] = [];
  lineas.forEach((linea, origen) => {
    const producto = obtenerProducto(linea.productoId);
    if (producto.formaVenta !== 'fraccion') {
      armadas.push({
        productoId: linea.productoId,
        cantidad: linea.cantidad,
        costoUnitario: linea.costoUnitario,
        descripcion: linea.descripcion,
        unidad: null,
        factorStock: 1,
        costoProducto: linea.costoUnitario,
        origen,
      });
      return;
    }
    const config = configuracionFraccionDeProducto(producto, true);
    if (!config) {
      throw new ErrorDeNegocio(`Los datos de fracción de "${producto.nombre}" están incompletos. Edítalo en Productos.`);
    }
    if (!Number.isInteger(linea.cantidad) || linea.cantidad <= 0) {
      throw new ErrorDeNegocio(`La cantidad debe ser un número entero mayor a cero (producto: ${producto.nombre}).`);
    }
    if (!Number.isFinite(linea.costoUnitario) || linea.costoUnitario < 0) {
      throw new ErrorDeNegocio(`El costo no puede ser negativo (producto: ${producto.nombre}).`);
    }
    construirLineasCompraFraccion({ ...config, costoEntero: linea.costoUnitario }, linea.cantidad).forEach((l, i) => {
      armadas.push({
        productoId: linea.productoId,
        cantidad: l.cantidad,
        costoUnitario: l.costoUnitario,
        // La nota va solo en la primera línea del producto.
        descripcion: i === 0 ? linea.descripcion : null,
        unidad: l.unidad,
        factorStock: l.factorStock,
        costoProducto: linea.costoUnitario,
        origen,
      });
    });
  });
  return armadas;
}

/** Una línea de compra tal como quedó guardada en detalle_compra. */
export interface FilaCompraGuardada {
  productoId: number;
  cantidad: number;
  costoUnitario: number;
  descripcion: string | null;
  unidad: string | null;
  factorStock: number;
}

/**
 * Lo contrario de armarLineasDeCompra, para volver a abrir una compra en Modificar: las líneas de cajas y de unidades de
 * un producto por fracciones vuelven a ser UNA (total en unidades base y costo del entero). `factorDelProducto` se usa
 * solo cuando la compra no tuvo ninguna caja entera (el factor sale del producto).
 */
export function colapsarLineasDeCompra(
  filas: FilaCompraGuardada[],
  factorDelProducto: (productoId: number) => number | null,
): { productoId: number; cantidad: number; costoUnitario: number; descripcion: string | null }[] {
  const salida: { productoId: number; cantidad: number; costoUnitario: number; descripcion: string | null }[] = [];
  const posicion = new Map<number, number>();
  for (const fila of filas) {
    if (fila.unidad === null) {
      salida.push({ productoId: fila.productoId, cantidad: fila.cantidad, costoUnitario: fila.costoUnitario, descripcion: fila.descripcion });
      continue;
    }
    const base = Math.round(fila.cantidad * fila.factorStock);
    // Costo del entero: el de la línea de cajas tal cual; el de una línea de unidades × cuántas trae (sin el ruido del redondeo).
    let costoEntero = fila.costoUnitario;
    if (fila.factorStock === 1) {
      const bruto = fila.costoUnitario * (factorDelProducto(fila.productoId) ?? 1);
      const aCentavos = Math.round(bruto * 100) / 100;
      costoEntero = Math.abs(bruto - aCentavos) < 1e-3 ? aCentavos : Math.round(bruto * 10_000) / 10_000;
    }
    const indice = posicion.get(fila.productoId);
    const previo = indice === undefined ? undefined : salida[indice];
    if (!previo) {
      posicion.set(fila.productoId, salida.length);
      salida.push({ productoId: fila.productoId, cantidad: base, costoUnitario: costoEntero, descripcion: fila.descripcion });
    } else {
      previo.cantidad += base;
      if (fila.factorStock > 1) previo.costoUnitario = costoEntero;
      if (!previo.descripcion && fila.descripcion) previo.descripcion = fila.descripcion;
    }
  }
  return salida;
}

/**
 * Importe de una línea de compra por fracciones SIN redondear (cajas × costo + unidades × costo ÷ factor): es lo que
 * suma el total de la compra, igual que en el repositorio.
 */
export function importeCompraFraccion(
  config: Pick<ConfiguracionFraccion, 'unidadEntera' | 'unidadFraccion' | 'factor'>,
  costoEntero: number,
  totalBase: number,
): number {
  if (!Number.isInteger(totalBase) || totalBase <= 0) return 0;
  return construirLineasCompraFraccion({ ...config, costoEntero }, totalBase).reduce(
    (suma, l) => suma + l.cantidad * l.costoUnitario,
    0,
  );
}

/** Subtotal de una línea de compra por fracciones para mostrar en pantalla (a 2 decimales). */
export function subtotalCompraFraccion(
  config: Pick<ConfiguracionFraccion, 'unidadEntera' | 'unidadFraccion' | 'factor'>,
  costoEntero: number,
  totalBase: number,
): number {
  return redondear(importeCompraFraccion(config, costoEntero, totalBase));
}

/** El stock de un producto como se lee: «20 cajas y 8 unidades» si es por fracciones, el número de siempre si no. */
export function textoStockDeProducto(producto: Producto): string {
  const config = configuracionFraccionDeProducto(producto, true);
  return config ? textoCantidadFraccion(producto.stockActual, config) : String(producto.stockActual);
}

/**
 * Nueva cantidad total (unidades base) al escribir en una de las dos casillas (cajas o unidades) de una compra. Se juntan y se
 * vuelven a separar, así [1] caja y [12] unidades pasan a [2] cajas. Los decimales y los negativos se descartan.
 */
export function cantidadBaseDesdeCasillas(
  factor: number,
  cantidadActual: number,
  campo: 'enteros' | 'sueltas',
  valor: number,
): number {
  const escrito = Number.isFinite(valor) ? Math.max(0, Math.floor(valor)) : 0;
  const actuales = separarEnBase(Math.max(0, Math.round(cantidadActual)), factor);
  const enteros = campo === 'enteros' ? escrito : actuales.enteros;
  const sueltas = campo === 'sueltas' ? escrito : actuales.sueltas;
  return enteros * factor + sueltas;
}

// ------------------------------------------------------------
// Reportes y exportaciones
// ------------------------------------------------------------

/** Los datos del producto que hacen falta para contar lo vendido (vienen de la tabla producto). */
export interface DatosFraccionProducto {
  formaVenta: string | null;
  unidadEntera: string | null;
  unidadFraccion: string | null;
  factorFraccion: number | null;
}

/**
 * La cantidad vendida de un producto en un reporte, a partir de TODO lo que movió en unidades base (cajas × 12 + unidades).
 * Un producto por fracciones se cuenta en enteros equivalentes (1 caja y 6 unidades = 1.5 cajas) para poder ordenarlo junto a
 * los demás, y trae su texto «1 caja y 6 unidades». Un producto normal se cuenta como siempre.
 */
export function resumenCantidadVendida(
  base: number,
  producto: DatosFraccionProducto,
): { cantidad: number; cantidadTexto?: string; unidadEntera?: string } {
  const { unidadEntera, unidadFraccion, factorFraccion } = producto;
  if (producto.formaVenta !== 'fraccion' || !unidadEntera || !unidadFraccion || !factorFraccion || factorFraccion < 2) {
    return { cantidad: base };
  }
  return {
    cantidad: redondear(base / factorFraccion),
    cantidadTexto: textoCantidadFraccion(Math.max(0, Math.round(base)), { unidadEntera, unidadFraccion, factor: factorFraccion }),
    unidadEntera,
  };
}

/** «GALLETA SODA (Caja)» si la línea tiene unidad; el nombre solo si no (las ventas de siempre). */
export function nombreConUnidad(nombre: string, unidad: string | null | undefined): string {
  return unidad ? `${nombre} (${unidad})` : nombre;
}

/** «GALLETA SODA (en cajas)» para un reporte cuya cantidad está en enteros equivalentes; el nombre solo si es un producto normal. */
export function nombreConCantidadEn(nombre: string, unidadEntera: string | null | undefined): string {
  return unidadEntera ? `${nombre} (en ${textoUnidad(unidadEntera, 2)})` : nombre;
}

/**
 * Lo que se escribe en la columna «Unidad» de la lista de productos: la unidad normal, o —en un producto por fracciones,
 * cuyo stock está en la unidad más pequeña— cómo leer sus números.
 */
export function etiquetaUnidadProducto(
  producto: Pick<Producto, 'unidadMedida' | 'formaVenta' | 'unidadEntera' | 'unidadFraccion' | 'factorFraccion'>,
): string {
  if (producto.formaVenta !== 'fraccion' || !producto.unidadEntera || !producto.unidadFraccion || !producto.factorFraccion) {
    return producto.unidadMedida;
  }
  return `${producto.unidadFraccion} (stock en ${textoUnidad(producto.unidadFraccion, 2)}; precio y costo por ${producto.unidadEntera}; 1 ${producto.unidadEntera} = ${producto.factorFraccion})`;
}

/** El stock con su unidad: «20 cajas y 8 unidades» por fracciones; «25 unidad» (como siempre) en los demás. */
export function textoStockConUnidad(producto: Producto): string {
  return configuracionFraccionDeProducto(producto, true)
    ? textoStockDeProducto(producto)
    : `${producto.stockActual} ${producto.unidadMedida}`;
}

// ------------------------------------------------------------
// Precio de la fracción al crear o editar un producto
// ------------------------------------------------------------

export interface PrecioFraccionEstado {
  texto: string;
  /** true = el precio lo escribió el usuario (no se recalcula solo); false = se calcula solo (precio entero ÷ cuántas trae). */
  manual: boolean;
}

/**
 * Lo que pasa al escribir en «Precio por Unidad»: desde que el usuario toca la casilla el precio es suyo, AUNQUE borre todo
 * para escribir otro número (antes, al dejarla vacía volvía el precio automático y no se podía escribir, por ejemplo, 1).
 */
export function alEscribirPrecioFraccion(textoTipeado: string): PrecioFraccionEstado {
  return { texto: limpiarDecimalEscrito(textoTipeado), manual: true };
}

/** Al salir de la casilla: si quedó vacía, el precio vuelve a calcularse solo; si tiene un número, se queda como lo escribió. */
export function alSalirPrecioFraccion(estado: PrecioFraccionEstado): PrecioFraccionEstado {
  return estado.texto.trim() === '' ? { texto: estado.texto, manual: false } : estado;
}

// ------------------------------------------------------------
// Las líneas que Nueva venta manda a calcular y a guardar
// ------------------------------------------------------------

/** Lo que Nueva venta guarda de cada producto del carrito (solo lo que hace falta para armar las líneas). */
export interface LineaDeCarritoParaVender {
  productoId: number;
  cantidad: number;
  precioVenta: number;
  descripcion: string;
  /** Hay datos aquí solo en las líneas por fracciones (interruptor encendido). */
  fraccion?: unknown;
  subtotalEditado?: number;
}

/**
 * Las líneas de entrada de una venta a partir del carrito. Es UNA sola función para el cálculo de la pantalla y para guardar la
 * venta: así lo que se ve y lo que se cobra no pueden diferir (una vez el subtotal editado se veía en pantalla pero no se guardaba).
 * Con «Precio editable al vender» activo: los productos normales mandan su precio y los de fracciones su subtotal editado.
 */
export function lineasDeVentaDesdeCarrito(
  carrito: LineaDeCarritoParaVender[],
  opciones: { precioEditable: boolean; descripcionActiva: boolean },
): LineaVentaEntrada[] {
  return carrito.map((l) => ({
    productoId: l.productoId,
    cantidad: l.cantidad,
    precioUnitario: opciones.precioEditable && !l.fraccion ? l.precioVenta : undefined,
    subtotalEditado: opciones.precioEditable && l.fraccion ? l.subtotalEditado : undefined,
    descripcion: opciones.descripcionActiva ? l.descripcion : null,
  }));
}
