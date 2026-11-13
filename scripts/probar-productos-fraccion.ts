/**
 * Prueba de la Etapa 2 de Venta Entero/Fracción: Productos (crear, editar, cambiar de forma, ajustar stock) sobre una
 * base real, más las protecciones temporales de Venta y Compras y la revisión del código de la pantalla.
 *
 * Uso: npx tsx scripts/probar-productos-fraccion.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { CajaRepositorioSqlite } from '../src/infraestructura/sqlite/caja.repositorio';
import { CompraRepositorioSqlite } from '../src/infraestructura/sqlite/compra.repositorio';
import { ConfiguracionRepositorioSqlite } from '../src/infraestructura/sqlite/configuracion.repositorio';
import { ProductoRepositorioSqlite } from '../src/infraestructura/sqlite/producto.repositorio';
import { VentaRepositorioSqlite } from '../src/infraestructura/sqlite/venta.repositorio';
import type { RegistroActividad } from '../src/core/actividad';
import { ErrorDeNegocio } from '../src/core/reglas-negocio';
import {
  configuracionFraccionDeProducto,
  convertirAEntero,
  convertirAFracciones,
  enteroDeTexto,
  formatearPrecioFraccion,
  textoCantidadFraccion,
  textoPrecioFraccion,
} from '../src/core/venta-fraccion';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

/** Devuelve el mensaje si la acción lanza un error de negocio; null si no lanza nada. */
function mensajeDe(accion: () => void): string | null {
  try {
    accion();
    return null;
  } catch (e) {
    return e instanceof ErrorDeNegocio ? e.message : `OTRO ERROR: ${String(e)}`;
  }
}

const localizarArchivo = () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const leer = (...ruta: string[]) => readFileSync(path.join(__dirname, '..', ...ruta), 'utf-8');

const base = { costo: 14, stockMinimo: 24, controlaStock: true, unidadMedida: 'unidad' } as const;
const fraccionGalleta = { formaVenta: 'fraccion', unidadEntera: 'Caja', unidadFraccion: 'Unidad', factorFraccion: 12, precioFraccion: 2 } as const;

async function main() {
  // ---- Funciones puras nuevas
  const aFrac = convertirAFracciones(20, 2, 12);
  afirmar(aFrac.stock === 240 && aFrac.minimo === 24, 'Entero → Fracciones: 20 cajas y mínimo 2 pasan a 240 y 24 unidades');
  const aKg = convertirAFracciones(2.5, 0.5, 1000);
  afirmar(aKg.stock === 2500 && aKg.minimo === 500, 'Entero → Fracciones: 2.5 kg y mínimo 0.5 kg pasan a 2500 y 500 gramos');
  const config = { unidadEntera: 'Caja', unidadFraccion: 'Unidad', factor: 12 };
  const aEntero = convertirAEntero(240, 25, config);
  afirmar(aEntero.stock === 20 && aEntero.minimo === 3, 'Fracciones → Entero: 240 unidades = 20 cajas; el mínimo 25 sube a 3 cajas (redondeo hacia arriba)');
  const conSueltas = mensajeDe(() => convertirAEntero(248, 0, config));
  afirmar(conSueltas?.includes('20 cajas y 8 unidades') === true && conSueltas.includes('Ajuste de stock'), 'Fracciones → Entero con unidades sueltas: se rechaza y explica qué hacer');
  afirmar(enteroDeTexto('') === 0 && enteroDeTexto(' 12 ') === 12 && enteroDeTexto('0') === 0, 'Las casillas vacías valen 0');
  afirmar(textoPrecioFraccion(1.67) === '1.67' && textoPrecioFraccion(0.008) === '0.008' && textoPrecioFraccion(0) === '' && textoPrecioFraccion(Number.NaN) === '', 'El precio de la fracción como texto de casilla');
  afirmar(formatearPrecioFraccion(1.67, 'S/') === 'S/ 1.67' && formatearPrecioFraccion(0.008, 'S/') === 'S/ 0.008' && formatearPrecioFraccion(2, 'S/') === 'S/ 2.00' && formatearPrecioFraccion(0, 'S/') === 'S/ 0.00', 'El precio de una fracción se muestra con sus decimales (S/ 0.008, no S/ 0.01)');

  const bd = await BaseDatosLocal.crear({ localizarArchivo });
  const configuracion = new ConfiguracionRepositorioSqlite(bd);
  const productos = new ProductoRepositorioSqlite(bd);
  const caja = new CajaRepositorioSqlite(bd);
  const ventas = new VentaRepositorioSqlite(bd, productos, caja, configuracion);
  const compras = new CompraRepositorioSqlite(bd, productos, caja);

  // ---- Crear un producto por fracciones (20 cajas y 8 unidades = 248)
  const galleta = productos.crear({ nombre: 'Galleta Soda', precioVenta: 20, ...base, stockActual: 248, ...fraccionGalleta });
  afirmar(galleta.formaVenta === 'fraccion' && galleta.unidadEntera === 'Caja' && galleta.unidadFraccion === 'Unidad', 'Se crea con forma Fracciones y sus dos unidades');
  afirmar(galleta.factorFraccion === 12 && galleta.precioFraccion === 2 && galleta.precioVenta === 20 && galleta.costo === 14, 'Guarda cuántas trae, el precio de la fracción y el precio y costo del entero');
  afirmar(galleta.stockActual === 248 && galleta.stockMinimo === 24, 'El stock queda en la unidad más pequeña (248 y mínimo 24)');
  const cfg = configuracionFraccionDeProducto(galleta, true);
  afirmar(cfg !== null && textoCantidadFraccion(galleta.stockActual, cfg) === '20 cajas y 8 unidades', 'En la lista se muestra «20 cajas y 8 unidades»');
  const minimoTexto = cfg ? textoCantidadFraccion(galleta.stockMinimo, cfg) : '';
  afirmar(minimoTexto === '2 cajas', 'El stock mínimo 24 se ve como «2 cajas»');

  const normalizado = productos.crear({ nombre: 'Arroz', precioVenta: 8, costo: 6, stockActual: 2500, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad', formaVenta: 'fraccion', unidadEntera: 'kg', unidadFraccion: ' gramo ', factorFraccion: 1000, precioFraccion: 0.008 });
  afirmar(normalizado.unidadEntera === 'Kg' && normalizado.unidadFraccion === 'Gramo', 'Las unidades se guardan con el nombre de la lista aunque lleguen en minúsculas o con espacios');
  afirmar(normalizado.precioFraccion === 0.008 && normalizado.stockActual === 2500, 'Kg → Gramo: precio 0.008 y 2500 gramos');

  const comun = productos.crear({ nombre: 'Inca Kola', precioVenta: 3, costo: 2, stockActual: 20, stockMinimo: 5, controlaStock: true, unidadMedida: 'unidad' });
  afirmar(comun.formaVenta === 'entero' && comun.unidadEntera === null && comun.factorFraccion === null && comun.stockActual === 20, 'Un producto sin indicar forma nace Entero y no cambia nada');
  const kilo = productos.crear({ nombre: 'Azúcar suelta', precioVenta: 4, costo: 3, stockActual: 2.5, stockMinimo: 0, controlaStock: true, unidadMedida: 'kg', formaVenta: 'entero' });
  afirmar(kilo.stockActual === 2.5, 'Un producto Entero sigue aceptando stock con decimales (2.5 kg)');

  // ---- Datos inválidos al crear
  const datosMalos = (cambios: Record<string, unknown>) => () =>
    productos.crear({ nombre: `Malo ${Math.random()}`, precioVenta: 20, ...base, stockActual: 0, ...fraccionGalleta, ...cambios } as Parameters<typeof productos.crear>[0]);
  afirmar(mensajeDe(datosMalos({ unidadFraccion: 'Caja' }))?.includes('distintas') === true, 'Caja → Caja se rechaza');
  afirmar(mensajeDe(datosMalos({ factorFraccion: 1 })) !== null && mensajeDe(datosMalos({ factorFraccion: null })) !== null, 'Cuántas trae: 1 o vacío se rechaza');
  afirmar(mensajeDe(datosMalos({ unidadEntera: 'Tonel' })) !== null, 'Una unidad que no está en la lista se rechaza');
  afirmar(mensajeDe(datosMalos({ precioFraccion: -1 })) !== null && mensajeDe(datosMalos({ precioFraccion: null })) !== null, 'Precio de la fracción negativo o vacío se rechaza');
  afirmar(mensajeDe(datosMalos({ stockActual: 10.5 }))?.includes('número entero de unidades') === true, 'Un stock inicial con decimales se rechaza («número entero de unidades»)');
  afirmar(mensajeDe(datosMalos({ stockMinimo: 2.5 }))?.includes('El stock mínimo debe ser un número entero') === true, 'Un stock mínimo con decimales se rechaza');
  afirmar(productos.listarTodos().length === 4, 'Ningún producto inválido llegó a guardarse');
  const sinControl = productos.crear({ nombre: 'Sin control', precioVenta: 20, ...base, stockActual: 55.5, ...fraccionGalleta, controlaStock: false });
  afirmar(sinControl.stockActual === 0 && sinControl.stockMinimo === 0, 'Sin control de stock no se pide stock entero: queda en 0');
  const insumoFraccion = productos.crear({ nombre: 'Insumo X', precioVenta: 0, costo: 5, stockActual: 0, stockMinimo: 0, controlaStock: false, unidadMedida: 'unidad', tipo: 'insumo', ...fraccionGalleta });
  afirmar(insumoFraccion.formaVenta === 'entero' && insumoFraccion.unidadEntera === null, 'Un insumo nunca es de Fracciones (se guarda Entero)');

  // ---- Listados: la venta por voz todavía no sabe pedir cajas o unidades
  afirmar(!productos.listarActivosParaVenta().some((p) => p.id === galleta.id) && productos.listarActivosParaVenta().some((p) => p.id === comun.id), 'El listado de la venta por voz no ofrece los productos por fracciones, sí los demás');
  afirmar(!productos.buscarPorNombre('Galleta').some((p) => p.id === galleta.id), 'La búsqueda por nombre de la venta por voz tampoco los ofrece');
  afirmar(productos.listarActivos().some((p) => p.id === galleta.id) && productos.listarTodos().some((p) => p.id === galleta.id), 'La pantalla Productos sí los lista');

  // ---- Ventas y compras normales siguen igual (vender y comprar por fracciones: ver probar-venta-fraccion y probar-compra-fraccion)
  const ventaNormal = ventas.registrarVenta({ lineas: [{ productoId: comun.id, cantidad: 2 }], metodoPago: 'efectivo' });
  afirmar(ventaNormal.total === 6 && productos.obtenerPorId(comun.id).stockActual === 18, 'Una venta normal sigue funcionando igual');
  const compraNormal = compras.registrarCompra({ lineas: [{ productoId: comun.id, cantidad: 5, costoUnitario: 2 }], metodoPago: 'efectivo' });
  afirmar(compraNormal.total === 10 && productos.obtenerPorId(comun.id).stockActual === 23, 'Una compra normal sigue funcionando igual');

  // ---- Ajustar stock en cajas y unidades (el ajuste llega en unidades base)
  const tras = productos.ajustarStock(galleta.id, 1 * 12 + 8, 'conteo físico');
  afirmar(tras.stockActual === 268, 'Sumar 1 caja y 8 unidades: 248 + 20 = 268 (22 cajas y 4 unidades)');
  afirmar(productos.ajustarStock(galleta.id, -(2 * 12), 'merma').stockActual === 244, 'Restar 2 cajas: 268 − 24 = 244');
  afirmar(mensajeDe(() => productos.ajustarStock(galleta.id, 2.5, 'x'))?.includes('números enteros de unidades') === true, 'Un ajuste con decimales se rechaza');
  afirmar(mensajeDe(() => productos.ajustarStock(galleta.id, -1000, 'x'))?.includes('negativo') === true, 'No se puede restar más de lo que hay');
  afirmar(productos.obtenerPorId(galleta.id).stockActual === 244, 'Los ajustes rechazados no cambiaron el stock');
  afirmar(productos.ajustarStock(kilo.id, 0.5, 'balanza').stockActual === 3, 'Un producto Entero sigue admitiendo ajustes con decimales (0.5 kg)');
  const kardex = productos.listarMovimientosInventario(galleta.id, '2000-01-01', '2999-12-31');
  afirmar(kardex.length === 2 && kardex[0]?.cantidad === 20 && kardex[1]?.cantidad === -24 && kardex[1]?.stockResultante === 244, 'El Kardex guarda los ajustes en unidades base (+20 y −24, stock 244)');
  afirmar(productos.listarHistorial(galleta.id).some((h) => h.campo === 'stock' && h.motivo === 'conteo físico'), 'La bitácora anota el ajuste con su motivo');

  // ---- Editar un producto por fracciones (sin tocar la forma)
  const editado = productos.actualizar(galleta.id, { nombre: 'Galleta Soda', precioVenta: 22, costo: 15, stockMinimo: 36, controlaStock: true, unidadMedida: 'unidad', activo: true });
  afirmar(editado.formaVenta === 'fraccion' && editado.unidadEntera === 'Caja' && editado.factorFraccion === 12 && editado.precioFraccion === 2, 'Editar solo precio y costo conserva las unidades, cuántas trae y el precio de la fracción');
  afirmar(editado.precioVenta === 22 && editado.costo === 15 && editado.stockMinimo === 36 && editado.stockActual === 244, 'Cambia lo editado y el stock no se toca');
  const cambioPrecio = productos.actualizar(galleta.id, { nombre: 'Galleta Soda', precioVenta: 22, costo: 15, stockMinimo: 36, controlaStock: true, unidadMedida: 'unidad', activo: true, ...fraccionGalleta, precioFraccion: 2.1, factorFraccion: 10 });
  afirmar(cambioPrecio.precioFraccion === 2.1 && cambioPrecio.factorFraccion === 10 && cambioPrecio.stockActual === 244, 'Cambiar el precio de la fracción o cuántas trae se guarda; el stock (244 unidades) no se mueve');
  afirmar(mensajeDe(() => productos.actualizar(galleta.id, { nombre: 'Galleta Soda', precioVenta: 22, costo: 15, stockMinimo: 3.5, controlaStock: true, unidadMedida: 'unidad', activo: true })) !== null, 'Un stock mínimo con decimales en un producto por fracciones se rechaza');
  productos.actualizar(galleta.id, { nombre: 'Galleta Soda', precioVenta: 22, costo: 15, stockMinimo: 36, controlaStock: true, unidadMedida: 'unidad', activo: true, ...fraccionGalleta });

  // ---- Cambiar un producto Entero a Fracciones (convierte el stock)
  productos.ajustarStock(comun.id, 1, 'conteo');   // un ajuste ya registrado (Kardex)
  const antesComun = productos.obtenerPorId(comun.id);
  afirmar(!productos.puedeCambiarFormaVenta(comun.id), 'Un producto con ventas o compras no puede cambiar de forma (todavía)');
  const mensajeConHistorial = mensajeDe(() => productos.actualizar(comun.id, { nombre: 'Inca Kola', precioVenta: 3, costo: 2, stockMinimo: 5, controlaStock: true, unidadMedida: 'unidad', activo: true, ...fraccionGalleta }));
  afirmar(mensajeConHistorial?.includes('ya tiene ventas o compras') === true, 'Cambiar a Fracciones un producto con ventas o compras se rechaza con un mensaje claro');
  afirmar(productos.obtenerPorId(comun.id).stockActual === antesComun.stockActual && productos.obtenerPorId(comun.id).formaVenta === 'entero', 'Lo rechazado no cambió nada');

  const lata = productos.crear({ nombre: 'Gaseosa lata', precioVenta: 24, costo: 18, stockActual: 20, stockMinimo: 2, controlaStock: true, unidadMedida: 'unidad' });
  productos.ajustarStock(lata.id, 5, 'reposición');                         // 25 y un ajuste en el Kardex
  afirmar(productos.puedeCambiarFormaVenta(lata.id), 'Un producto sin ventas ni compras sí puede cambiar de forma');
  const convertida = productos.actualizar(lata.id, { nombre: 'Gaseosa lata', precioVenta: 24, costo: 18, stockMinimo: 999, controlaStock: true, unidadMedida: 'unidad', activo: true, ...fraccionGalleta });
  afirmar(convertida.formaVenta === 'fraccion' && convertida.stockActual === 300 && convertida.stockMinimo === 24, 'Entero → Fracciones: 25 cajas pasan a 300 unidades y el mínimo 2 a 24 (lo que venga en stockMinimo se ignora)');
  const kardexLata = productos.listarMovimientosInventario(lata.id, '2000-01-01', '2999-12-31');
  afirmar(kardexLata.length === 1 && kardexLata[0]?.cantidad === 60 && kardexLata[0]?.stockResultante === 300, 'El ajuste que ya estaba en el Kardex se convierte (+5 cajas = +60 unidades, stock 300)');
  const bitacora = productos.listarHistorial(lata.id).find((h) => h.campo === 'stock' && h.motivo !== null && h.motivo.includes('Cambió a venta por fracciones'));
  afirmar(bitacora?.valorAnterior === '25' && bitacora.valorNuevo === '300', 'La bitácora anota la conversión del stock con su motivo (25 → 300)');
  afirmar(productos.listarHistorial(lata.id).some((h) => h.campo === 'stock_minimo' && h.valorAnterior === '2' && h.valorNuevo === '24'), 'La bitácora anota la conversión del stock mínimo (2 → 24)');

  // ---- Volver a Entero
  afirmar(!productos.puedeCambiarFormaVenta(lata.id), 'Para volver a Entero tampoco puede tener ajustes de stock (aquí tiene uno)');
  const nueva = productos.crear({ nombre: 'Gaseosa nueva', precioVenta: 24, costo: 18, stockActual: 240, stockMinimo: 25, controlaStock: true, unidadMedida: 'unidad', ...fraccionGalleta });
  afirmar(productos.puedeCambiarFormaVenta(nueva.id), 'Un producto por fracciones recién creado (sin movimientos) puede volver a Entero');
  const sueltas = productos.crear({ nombre: 'Con sueltas', precioVenta: 24, costo: 18, stockActual: 245, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad', ...fraccionGalleta });
  const rechazoSueltas = mensajeDe(() => productos.actualizar(sueltas.id, { nombre: 'Con sueltas', precioVenta: 24, costo: 18, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad', activo: true, formaVenta: 'entero' }));
  afirmar(rechazoSueltas?.includes('20 cajas y 5 unidades') === true && productos.obtenerPorId(sueltas.id).stockActual === 245, 'Volver a Entero con unidades sueltas se rechaza y el stock queda intacto');
  const vuelta = productos.actualizar(nueva.id, { nombre: 'Gaseosa nueva', precioVenta: 24, costo: 18, stockMinimo: 999, controlaStock: true, unidadMedida: 'unidad', activo: true, formaVenta: 'entero' });
  afirmar(vuelta.formaVenta === 'entero' && vuelta.stockActual === 20 && vuelta.stockMinimo === 3, 'Fracciones → Entero: 240 unidades pasan a 20 cajas y el mínimo 25 a 3');
  afirmar(vuelta.unidadEntera === null && vuelta.unidadFraccion === null && vuelta.factorFraccion === null && vuelta.precioFraccion === null, 'Al volver a Entero se borran los datos de fracción');
  afirmar(productos.listarActivosParaVenta().some((p) => p.id === nueva.id), 'Y vuelve a salir en Nueva venta');

  // ---- Un producto por fracciones puede pasar a Insumo solo con stock 0
  const aInsumo = productos.crear({ nombre: 'Para insumo', precioVenta: 24, costo: 18, stockActual: 0, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad', ...fraccionGalleta });
  const comoInsumo = productos.actualizar(aInsumo.id, { nombre: 'Para insumo', precioVenta: 24, costo: 18, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad', activo: true, tipo: 'insumo' });
  afirmar(comoInsumo.tipo === 'insumo' && comoInsumo.formaVenta === 'entero' && comoInsumo.unidadEntera === null, 'Pasar a Insumo deja el producto Entero y borra los datos de fracción');

  // ---- Sin control de stock al cambiar de forma
  const sc = productos.crear({ nombre: 'Sin stock', precioVenta: 10, costo: 5, stockActual: 0, stockMinimo: 0, controlaStock: false, unidadMedida: 'unidad' });
  const scFraccion = productos.actualizar(sc.id, { nombre: 'Sin stock', precioVenta: 10, costo: 5, stockMinimo: 0, controlaStock: false, unidadMedida: 'unidad', activo: true, ...fraccionGalleta });
  afirmar(scFraccion.formaVenta === 'fraccion' && scFraccion.stockActual === 0, 'Cambiar de forma un producto sin control de stock no toca el stock (0)');

  // ---- La actividad de usuarios dice qué pasó (se usa un registro falso para leer lo que se anota)
  const anotado: { accion: string; detalle?: string | null }[] = [];
  const registroFalso = { registrar: (r: { accion: string; detalle?: string | null }) => void anotado.push(r), usuarioActualId: () => null } as unknown as RegistroActividad;
  const conActividad = new ProductoRepositorioSqlite(bd, registroFalso);
  conActividad.ajustarStock(kilo.id, -1, 'se rompió');
  conActividad.ajustarStock(galleta.id, 1 * 12 + 8, 'conteo');
  conActividad.ajustarStock(galleta.id, -(2 * 12), 'merma');
  afirmar(anotado[0]?.detalle === 'AZÚCAR SUELTA (-1)', 'Un ajuste de un producto Entero se anota como siempre («AZÚCAR SUELTA (-1)»)');
  afirmar(anotado[1]?.detalle === 'GALLETA SODA (+1 caja y 8 unidades)', 'Un ajuste por fracciones se anota en cajas y unidades («+1 caja y 8 unidades»)');
  afirmar(anotado[2]?.detalle === 'GALLETA SODA (-2 cajas)', 'Restar 24 unidades se anota «−2 cajas»');
  const otra = conActividad.crear({ nombre: 'Para cambiar', precioVenta: 20, ...base, stockActual: 0, stockMinimo: 0 });
  conActividad.actualizar(otra.id, { nombre: 'Para cambiar', precioVenta: 20, costo: 14, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad', activo: true, ...fraccionGalleta });
  afirmar(anotado[anotado.length - 1]?.detalle === 'PARA CAMBIAR (ahora se vende por fracciones)', 'Cambiar la forma de venta se anota en la actividad');
  conActividad.actualizar(otra.id, { nombre: 'Para cambiar', precioVenta: 21, costo: 14, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad', activo: true });
  afirmar(anotado[anotado.length - 1]?.detalle === 'PARA CAMBIAR', 'Una edición normal se anota solo con el nombre, como siempre');

  // ---- Revisión del código de las pantallas
  const pagina = leer('src', 'app', 'productos', 'page.tsx');
  afirmar(pagina.includes('CLAVE_VENTA_ENTERO_FRACCION') && pagina.includes('<SelectorFormaVenta'), 'Productos lee el interruptor y muestra «Forma de Venta»');
  afirmar(pagina.includes('{tipo === \'venta_compra\' && ventaFraccion && ('), 'En Nuevo producto la forma de venta solo aparece con el interruptor encendido y un producto de Venta y Compra');
  afirmar(pagina.includes('fraccionNuevo.datos()') && pagina.includes('fraccionNuevo.stockEnUnidadesBase()'), 'Nuevo producto manda las unidades y guarda el stock en la unidad más pequeña');
  afirmar(pagina.includes('puedeCambiarFormaVenta(producto.id)') && pagina.includes('deshabilitado={!puedeCambiarFormaEdit}'), 'Editar producto avisa y bloquea la forma de venta si ya tiene ventas o compras');
  afirmar(pagina.includes('textoCantidadFraccion(producto.stockActual, configuracionFraccion)'), 'La lista muestra el stock como «cajas y unidades»');
  afirmar(pagina.includes('formatearPrecioFraccion(configuracionFraccion.precioFraccion, simboloMoneda)'), 'La lista muestra el precio de la caja y el de la unidad');
  afirmar(pagina.includes('configuracionFraccionDeProducto(productoAjustando, true)') && pagina.includes('<CampoCantidadFraccion'), 'Ajustar stock usa dos casillas (cajas y unidades) aunque el interruptor esté apagado');
  afirmar(pagina.includes('fraccionSinInterruptor') && pagina.includes('conservaMinimo'), 'Con el interruptor apagado un producto por fracciones se edita sin tocar su stock mínimo');
  const campos = leer('src', 'components', 'campos-fraccion.tsx');
  afirmar(['Forma de Venta:', 'Se vende por:', 'Se fracciona en:', 'trae:', 'Calcular de nuevo', 'Elige dos unidades distintas.'].every((t) => campos.includes(t)), 'Los campos nuevos tienen los textos acordados');
  afirmar(campos.includes("{ forma: 'entero', texto: 'Enteros' }") && campos.includes("{ forma: 'fraccion', texto: 'Fracciones' }"), 'La forma de venta se elige entre «Enteros» y «Fracciones»');
  const gancho = leer('src', 'hooks', 'usar-formulario-fraccion.ts');
  afirmar(gancho.includes('precioFraccionSugerido(Number(precioEnteroTexto), factor)') && gancho.includes('alEscribirPrecioFraccion(texto)') && gancho.includes('alSalirPrecioFraccion('), 'El precio de la fracción se calcula solo hasta que el usuario lo cambia (y si sale de la casilla vacía vuelve a calcularse)');
  afirmar(gancho.includes('factorSugerido(unidad, unidadFraccion)') && gancho.includes('factorSugerido(unidadEntera, unidad)'), 'Al elegir Kg → Gramo, «cuántas trae» se rellena solo (1000)');

  console.log('\n🎉 Productos por fracciones (Etapa 2) funciona.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
