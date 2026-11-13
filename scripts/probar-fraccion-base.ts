/**
 * Prueba de la Etapa 1 de Venta Entero/Fracción: lista de unidades, conversiones (caja ↔ unidades, kg ↔ gramos),
 * precios y costos, líneas de venta y de compra, stock, interruptor y columnas nuevas en una base real.
 *
 * Uso: npx tsx scripts/probar-fraccion-base.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { ProductoRepositorioSqlite } from '../src/infraestructura/sqlite/producto.repositorio';
import { ConfiguracionRepositorioSqlite } from '../src/infraestructura/sqlite/configuracion.repositorio';
import { CLAVE_VENTA_ENTERO_FRACCION, estaActivado, valorParaGuardar } from '../src/core/configuracion';
import { ErrorDeNegocio } from '../src/core/reglas-negocio';
import {
  NOMBRES_UNIDADES,
  UNIDADES_VENTA,
  buscarUnidad,
  esUnidadValida,
  factorSugerido,
  textoUnidad,
} from '../src/core/unidades';
import {
  aUnidadesBase,
  configuracionFraccionDeProducto,
  construirLineasCompraFraccion,
  construirLineasVentaFraccion,
  convertirStockEnteroABase,
  costoPorFraccion,
  formaVentaEfectiva,
  normalizarCantidad,
  precioFraccionSugerido,
  separarEnBase,
  textoCantidadFraccion,
  unidadesBaseDeLinea,
  validarConfiguracionFraccion,
  verificarStockFraccion,
  type ConfiguracionFraccion,
} from '../src/core/venta-fraccion';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

function lanza(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof ErrorDeNegocio ? e.message : `OTRO ERROR: ${String(e)}`;
  }
}

const localizarArchivo = () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

async function main() {
  // ---- Lista de unidades
  const esperadas = [
    'Caja', 'Unidad', 'Display', 'Botella', 'Kg', 'Gramo', 'Litro', 'Mililitro', 'Paquete', 'Bolsa', 'Lata', 'Rollo',
    'Docena', 'Jaba', 'Bandeja', 'Saco', 'Sobre', 'Galón', 'Libra', 'Metro', 'Par',
  ];
  afirmar(JSON.stringify([...NOMBRES_UNIDADES]) === JSON.stringify(esperadas), 'La lista tiene las 21 unidades acordadas, en orden');
  afirmar(new Set(NOMBRES_UNIDADES).size === UNIDADES_VENTA.length, 'No hay unidades repetidas');
  afirmar(esUnidadValida('caja') && esUnidadValida(' KG ') && !esUnidadValida('Tonel') && !esUnidadValida(null) && !esUnidadValida(''), 'Se reconoce una unidad sin importar mayúsculas; lo que no está en la lista no vale');
  afirmar(buscarUnidad('galón')?.nombre === 'Galón', 'Reconoce la unidad con tilde');
  afirmar(textoUnidad('Caja', 1) === 'caja' && textoUnidad('Caja', 20) === 'cajas' && textoUnidad('Caja', 0) === 'cajas', 'Plural: 1 caja, 20 cajas, 0 cajas');
  afirmar(textoUnidad('Kg', 1) === 'kg' && textoUnidad('Kg', 3) === 'kg', 'Kg no cambia en plural');
  afirmar(textoUnidad('Par', 2) === 'pares' && textoUnidad('Galón', 2) === 'galones' && textoUnidad('Unidad', 2) === 'unidades', 'Plurales con cambio: pares, galones, unidades');
  afirmar(factorSugerido('Kg', 'Gramo') === 1000 && factorSugerido('Litro', 'Mililitro') === 1000, 'Kg→Gramo y Litro→Mililitro sugieren 1000');
  afirmar(factorSugerido('Docena', 'Unidad') === 12 && factorSugerido('Par', 'Unidad') === 2, 'Docena→Unidad sugiere 12 y Par→Unidad 2');
  afirmar(factorSugerido('Caja', 'Unidad') === null && factorSugerido('Caja', 'Tonel') === null, 'Caja→Unidad no se adivina (lo escribe el usuario)');

  // ---- Conversiones: el ejemplo de las galletas (1 caja = 12)
  afirmar(aUnidadesBase(1, 8, 12) === 20, '1 caja y 8 galletas = 20 galletas');
  const uno12 = normalizarCantidad(1, 12, 12);
  afirmar(uno12.enteros === 2 && uno12.sueltas === 0, '[1] caja y [12] galletas se reconvierte a 2 cajas y 0 galletas');
  const ochoSolas = normalizarCantidad(1, 8, 12);
  afirmar(ochoSolas.enteros === 1 && ochoSolas.sueltas === 8, '[1] caja y [8] galletas se queda en 1 caja y 8 galletas');
  const treinta = normalizarCantidad(0, 30, 12);
  afirmar(treinta.enteros === 2 && treinta.sueltas === 6, '[0] cajas y [30] galletas = 2 cajas y 6 galletas');
  const kg = normalizarCantidad(1, 1250, 1000);
  afirmar(kg.enteros === 2 && kg.sueltas === 250, 'Kg: [1] kg y [1250] g = 2 kg y 250 g');
  afirmar(lanza(() => aUnidadesBase(1.5, 0, 12)) !== null && lanza(() => aUnidadesBase(1, 0.5, 12)) !== null, 'No se aceptan decimales en las casillas');
  afirmar(lanza(() => aUnidadesBase(-1, 0, 12)) !== null && lanza(() => aUnidadesBase(0, -3, 12)) !== null, 'No se aceptan cantidades negativas');
  afirmar(lanza(() => aUnidadesBase(Number.NaN, 0, 12)) !== null, 'No se acepta algo que no es número');
  const sep = separarEnBase(248, 12);
  afirmar(sep.enteros === 20 && sep.sueltas === 8, '248 galletas = 20 cajas y 8 galletas');
  afirmar(separarEnBase(0, 12).enteros === 0 && separarEnBase(0, 12).sueltas === 0, '0 se separa en 0 y 0');
  afirmar(lanza(() => separarEnBase(-5, 12)) !== null && lanza(() => separarEnBase(2.5, 12)) !== null, 'El total base no puede ser negativo ni con decimales');
  afirmar(convertirStockEnteroABase(20, 12) === 240, 'Un producto que ya tenía 20 cajas pasa a 240 unidades');
  afirmar(convertirStockEnteroABase(2.5, 1000) === 2500, 'Un producto que tenía 2.5 kg pasa a 2500 gramos');
  afirmar(convertirStockEnteroABase(0.3333, 12) === 4, 'Un stock con decimales se redondea a una unidad entera');

  // ---- Todas las combinaciones se separan y se vuelven a unir sin perder nada
  let combinaciones = 0;
  for (const factor of [2, 3, 6, 10, 12, 24, 100, 1000]) {
    for (let enteros = 0; enteros <= 30; enteros++) {
      for (let sueltas = 0; sueltas <= factor * 3; sueltas += Math.max(1, Math.floor(factor / 7))) {
        const total = aUnidadesBase(enteros, sueltas, factor);
        const partes = separarEnBase(total, factor);
        if (partes.enteros * factor + partes.sueltas !== total || partes.sueltas >= factor || partes.sueltas < 0) {
          throw new Error(`❌ Falló: factor ${factor}, ${enteros} y ${sueltas} no se separan bien (${JSON.stringify(partes)})`);
        }
        const normal = normalizarCantidad(enteros, sueltas, factor);
        if (normal.enteros * factor + normal.sueltas !== total) throw new Error(`❌ Falló: normalizar pierde unidades (factor ${factor})`);
        combinaciones++;
      }
    }
  }
  afirmar(true, `Separar y volver a unir no pierde ni una unidad (${combinaciones} combinaciones)`);

  // ---- Precios y costos
  afirmar(precioFraccionSugerido(20, 12) === 1.67, 'Precio sugerido: caja S/ 20.00 ÷ 12 = S/ 1.67 la unidad');
  afirmar(precioFraccionSugerido(24, 12) === 2, 'Precio sugerido: caja S/ 24.00 ÷ 12 = S/ 2.00 la unidad');
  afirmar(precioFraccionSugerido(8, 1000) === 0.008, 'Precio sugerido: kg S/ 8.00 ÷ 1000 = S/ 0.008 el gramo (3 decimales)');
  afirmar(precioFraccionSugerido(0.4, 1000) === 0.0004, 'Si ni con 3 decimales alcanza, usa 4 (S/ 0.0004)');
  afirmar(precioFraccionSugerido(0, 12) === 0 && precioFraccionSugerido(Number.NaN, 12) === 0 && precioFraccionSugerido(10, 0) === 0, 'Datos vacíos o inválidos → precio sugerido 0');
  afirmar(costoPorFraccion(14, 12) === 1.166667, 'Costo por unidad: S/ 14.00 ÷ 12 = 1.166667 (sin redondear a centavos)');
  afirmar(costoPorFraccion(0, 12) === 0 && costoPorFraccion(6, 1000) === 0.006, 'Costo 0 → 0; kg a S/ 6.00 → S/ 0.006 el gramo');

  // ---- Líneas de venta (caja S/ 20, unidad S/ 2, costo caja S/ 14)
  const galleta: ConfiguracionFraccion = {
    unidadEntera: 'Caja', unidadFraccion: 'Unidad', factor: 12, precioEntero: 20, precioFraccion: 2, costoEntero: 14,
  };
  const lineas1y8 = construirLineasVentaFraccion(galleta, aUnidadesBase(1, 8, 12));
  afirmar(lineas1y8.length === 2, '1 caja y 8 galletas se guarda como 2 líneas');
  afirmar(lineas1y8[0]?.unidad === 'Caja' && lineas1y8[0].cantidad === 1 && lineas1y8[0].precioUnitario === 20 && lineas1y8[0].subtotal === 20 && lineas1y8[0].factorStock === 12, 'Línea 1: 1 Caja × S/ 20.00 = S/ 20.00 (mueve 12 unidades de stock)');
  afirmar(lineas1y8[1]?.unidad === 'Unidad' && lineas1y8[1].cantidad === 8 && lineas1y8[1].precioUnitario === 2 && lineas1y8[1].subtotal === 16 && lineas1y8[1].factorStock === 1, 'Línea 2: 8 Unidad × S/ 2.00 = S/ 16.00 (mueve 1 unidad de stock cada una)');
  afirmar(lineas1y8[0]?.gananciaLinea === 6 && lineas1y8[1]?.gananciaLinea === 6.67, 'Ganancia: caja S/ 6.00 y 8 unidades S/ 6.67 (costo de la unidad = 14 ÷ 12)');
  const baseVendida = lineas1y8.reduce((s, l) => s + unidadesBaseDeLinea(l.cantidad, l.factorStock), 0);
  afirmar(baseVendida === 20, 'El stock que se descuenta suma exactamente 20 unidades');

  const lineas1y12 = construirLineasVentaFraccion(galleta, aUnidadesBase(1, 12, 12));
  afirmar(lineas1y12.length === 1 && lineas1y12[0]?.cantidad === 2 && lineas1y12[0].unidad === 'Caja' && lineas1y12[0].subtotal === 40, '[1] y [12] se cobra como 2 cajas = S/ 40.00 (no S/ 44.00)');
  afirmar(construirLineasVentaFraccion(galleta, 24).length === 1 && construirLineasVentaFraccion(galleta, 5).length === 1, 'Una línea con cantidad 0 no se crea (solo cajas, o solo unidades)');
  afirmar(construirLineasVentaFraccion(galleta, 0).length === 0, 'Cantidad 0 → ninguna línea');
  afirmar(lanza(() => construirLineasVentaFraccion(galleta, 2.5)) !== null, 'Una cantidad con decimales no genera líneas');

  const arroz: ConfiguracionFraccion = {
    unidadEntera: 'Kg', unidadFraccion: 'Gramo', factor: 1000, precioEntero: 8, precioFraccion: 0.008, costoEntero: 6,
  };
  const lineasKg = construirLineasVentaFraccion(arroz, aUnidadesBase(0, 250, 1000));
  afirmar(lineasKg.length === 1 && lineasKg[0]?.unidad === 'Gramo' && lineasKg[0].subtotal === 2 && lineasKg[0].gananciaLinea === 0.5, 'Kg: 250 gramos × S/ 0.008 = S/ 2.00, ganancia S/ 0.50');
  const lineasKg2 = construirLineasVentaFraccion(arroz, aUnidadesBase(2, 500, 1000));
  afirmar(lineasKg2.length === 2 && lineasKg2[0]?.subtotal === 16 && lineasKg2[1]?.subtotal === 4, 'Kg: 2 kg y 500 g = S/ 16.00 + S/ 4.00');

  // ---- Líneas de compra
  const compra = construirLineasCompraFraccion(galleta, aUnidadesBase(5, 0, 12));
  afirmar(compra.length === 1 && compra[0]?.cantidad === 5 && compra[0].costoUnitario === 14 && compra[0].subtotal === 70 && compra[0].factorStock === 12, 'Compra: 5 cajas × S/ 14.00 = S/ 70.00 (entran 60 unidades al stock)');
  afirmar(unidadesBaseDeLinea(compra[0]?.cantidad ?? 0, compra[0]?.factorStock ?? 1) === 60, '5 cajas de 12 suman 60 unidades de stock');
  const compraMixta = construirLineasCompraFraccion(galleta, aUnidadesBase(1, 6, 12));
  afirmar(compraMixta.length === 2 && compraMixta[1]?.unidad === 'Unidad' && compraMixta[1].subtotal === 7, 'Compra: 1 caja y 6 unidades suelta → la unidad cuesta 14 ÷ 12 y 6 salen S/ 7.00');
  afirmar(compraMixta.every((l) => l.gananciaLinea === 0 && l.precioUnitario === 0), 'Una compra no lleva precio de venta ni ganancia');

  // ---- Textos y stock
  const textoGalleta = (n: number) => textoCantidadFraccion(n, galleta);
  afirmar(textoGalleta(248) === '20 cajas y 8 unidades', 'Texto: 248 → "20 cajas y 8 unidades"');
  afirmar(textoGalleta(12) === '1 caja' && textoGalleta(8) === '8 unidades' && textoGalleta(1) === '1 unidad', 'Texto: "1 caja", "8 unidades", "1 unidad"');
  afirmar(textoGalleta(13) === '1 caja y 1 unidad' && textoGalleta(0) === '0 cajas', 'Texto: "1 caja y 1 unidad" y 0 → "0 cajas"');
  afirmar(textoCantidadFraccion(1250, arroz) === '1 kg y 250 gramos', 'Texto: 1250 g → "1 kg y 250 gramos"');
  afirmar(lanza(() => verificarStockFraccion('GALLETA', 20, 20, galleta)) === null, 'Se puede vender justo todo el stock');
  afirmar(lanza(() => verificarStockFraccion('GALLETA', 12, 8, galleta)) === null, 'Vender 8 galletas con 1 caja cerrada es válido (la caja se abre sola)');
  const faltante = lanza(() => verificarStockFraccion('GALLETA', 20, 25, galleta));
  afirmar(faltante === 'Stock insuficiente de "GALLETA". Disponible: 1 caja y 8 unidades, pedido: 2 cajas y 1 unidad.', 'Stock insuficiente: el mensaje dice cajas y unidades');
  afirmar(lanza(() => verificarStockFraccion('GALLETA', 20, 0, galleta)) !== null, 'Una cantidad en 0 se rechaza');

  // ---- Validación al crear / editar un producto
  const buena = { unidadEntera: 'Caja', unidadFraccion: 'Unidad', factor: 12, precioFraccion: 1.67 };
  afirmar(lanza(() => validarConfiguracionFraccion(buena)) === null, 'Caja → Unidad, 12, S/ 1.67 es válido');
  afirmar(lanza(() => validarConfiguracionFraccion({ ...buena, unidadEntera: null })) !== null, 'Sin unidad entera → error');
  afirmar(lanza(() => validarConfiguracionFraccion({ ...buena, unidadFraccion: 'Tonel' })) !== null, 'Unidad fracción que no está en la lista → error');
  afirmar(lanza(() => validarConfiguracionFraccion({ ...buena, unidadFraccion: 'caja' })) !== null, 'Las dos unidades iguales (Caja → Caja) → error');
  afirmar(lanza(() => validarConfiguracionFraccion({ ...buena, factor: 1 })) !== null && lanza(() => validarConfiguracionFraccion({ ...buena, factor: 0 })) !== null, 'Cuántas trae: 1 o 0 → error');
  afirmar(lanza(() => validarConfiguracionFraccion({ ...buena, factor: 2.5 })) !== null && lanza(() => validarConfiguracionFraccion({ ...buena, factor: null })) !== null, 'Cuántas trae: con decimales o vacío → error');
  afirmar(lanza(() => validarConfiguracionFraccion({ ...buena, precioFraccion: -1 })) !== null && lanza(() => validarConfiguracionFraccion({ ...buena, precioFraccion: null })) !== null, 'Precio de la fracción negativo o vacío → error');
  afirmar(lanza(() => validarConfiguracionFraccion({ ...buena, precioFraccion: 0 })) === null, 'Precio de la fracción en 0 se permite (regalo)');

  // ---- El interruptor manda sobre la forma de venta del producto
  afirmar(formaVentaEfectiva('fraccion', true) === 'fraccion', 'Producto de Fracciones + interruptor encendido → se vende en fracciones');
  afirmar(formaVentaEfectiva('fraccion', false) === 'entero', 'Producto de Fracciones + interruptor apagado → se vende solo en enteros');
  afirmar(formaVentaEfectiva('entero', true) === 'entero' && formaVentaEfectiva('entero', false) === 'entero', 'Producto Entero → siempre entero');
  const productoFraccion = {
    formaVenta: 'fraccion' as const, unidadEntera: 'Caja', unidadFraccion: 'Unidad', factorFraccion: 12, precioFraccion: 2, precioVenta: 20, costo: 14,
  };
  const cfg = configuracionFraccionDeProducto(productoFraccion, true);
  afirmar(cfg?.factor === 12 && cfg.precioEntero === 20 && cfg.precioFraccion === 2 && cfg.costoEntero === 14, 'Con el interruptor encendido se arma la configuración de fracción del producto');
  afirmar(configuracionFraccionDeProducto(productoFraccion, false) === null, 'Con el interruptor apagado no hay configuración de fracción');
  afirmar(configuracionFraccionDeProducto({ ...productoFraccion, formaVenta: 'entero' }, true) === null, 'Un producto Entero no tiene configuración de fracción');
  afirmar(configuracionFraccionDeProducto({ ...productoFraccion, factorFraccion: null }, true) === null && configuracionFraccionDeProducto({ ...productoFraccion, unidadFraccion: null }, true) === null, 'Datos de fracción incompletos → se vende como entero (no revienta)');

  // ---- Interruptor guardado en la base
  const bd = await BaseDatosLocal.crear({ localizarArchivo });
  const configuracion = new ConfiguracionRepositorioSqlite(bd);
  afirmar(!estaActivado(configuracion.obtenerValor(CLAVE_VENTA_ENTERO_FRACCION)), 'El interruptor nace apagado');
  configuracion.establecerValor(CLAVE_VENTA_ENTERO_FRACCION, valorParaGuardar(true));
  afirmar(estaActivado(configuracion.obtenerValor(CLAVE_VENTA_ENTERO_FRACCION)), 'Al encenderlo se guarda');
  configuracion.establecerValor(CLAVE_VENTA_ENTERO_FRACCION, valorParaGuardar(false));
  afirmar(!estaActivado(configuracion.obtenerValor(CLAVE_VENTA_ENTERO_FRACCION)), 'Al apagarlo se guarda');

  // ---- Un producto nuevo (como los de hoy) nace en forma Entero y sin datos de fracción
  const productos = new ProductoRepositorioSqlite(bd);
  const normal = productos.crear({ nombre: 'Inca Kola', precioVenta: 3, costo: 2, stockActual: 20, stockMinimo: 5, controlaStock: true, unidadMedida: 'unidad' });
  afirmar(normal.formaVenta === 'entero' && normal.unidadEntera === null && normal.unidadFraccion === null && normal.factorFraccion === null && normal.precioFraccion === null, 'Un producto creado como hoy nace en forma Entero, sin datos de fracción');
  afirmar(productos.obtenerPorId(normal.id).stockActual === 20, 'Su stock sigue siendo el de siempre');

  // ---- Las columnas existen y respetan sus reglas
  bd.ejecutar("UPDATE producto SET forma_venta = 'fraccion', unidad_entera = 'Caja', unidad_fraccion = 'Unidad', factor_fraccion = 12, precio_fraccion = 1.67, stock_actual = 248 WHERE id = ?", [normal.id]);
  const leido = productos.obtenerPorId(normal.id);
  afirmar(leido.formaVenta === 'fraccion' && leido.unidadEntera === 'Caja' && leido.unidadFraccion === 'Unidad' && leido.factorFraccion === 12 && leido.precioFraccion === 1.67, 'El producto lee bien sus datos de fracción desde la base');
  afirmar(leido.stockActual === 248, 'El stock queda guardado como número entero de unidades base');
  const rechazos = [
    "UPDATE producto SET forma_venta = 'mitad' WHERE id = 1",
    'UPDATE producto SET factor_fraccion = 1 WHERE id = 1',
    'UPDATE producto SET precio_fraccion = -1 WHERE id = 1',
  ];
  for (const sentencia of rechazos) {
    let rechazada = false;
    try { bd.ejecutar(sentencia); } catch { rechazada = true; }
    afirmar(rechazada, `La base rechaza datos inválidos (${sentencia.replace('UPDATE producto SET ', '').replace(' WHERE id = 1', '')})`);
  }
  let factorStockRechazado = false;
  try { bd.ejecutar('INSERT INTO detalle_venta (venta_id, producto_id, cantidad, precio_unitario, costo_unitario, subtotal, ganancia_linea, factor_stock) VALUES (1, 1, 1, 1, 1, 1, 0, 0)'); } catch { factorStockRechazado = true; }
  afirmar(factorStockRechazado, 'La base rechaza un factor_stock menor a 1 en una línea');

  // ---- El interruptor de la pantalla ya no dice "Próximamente"
  const pagina = readFileSync(path.join(__dirname, '..', 'src', 'app', 'mas', 'configuracion', 'configuracion-venta', 'page.tsx'), 'utf-8');
  afirmar(pagina.includes('CLAVE_VENTA_ENTERO_FRACCION') && pagina.includes('alternarVentaEnteroFraccion'), 'La pantalla Configuración de Venta guarda el interruptor Venta Entero/Fracción');
  afirmar(!pagina.includes('Próximamente'), 'El interruptor ya no dice «Próximamente»');
  afirmar(pagina.includes('<Interruptor activado={ventaEnteroFraccion} onChange={alternarVentaEnteroFraccion} disabled={!contenedor} />'), 'El interruptor es de uso libre (no es Premium) y se puede tocar');

  console.log('\n🎉 La base de Venta Entero/Fracción (Etapa 1) funciona.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
