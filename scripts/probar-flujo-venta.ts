/**
 * Prueba de humo del flujo completo: crear producto -> registrar venta
 * en efectivo -> registrar venta al fiado -> ver resumen del día.
 * No usa IndexedDB (eso es solo del navegador); aquí se instancian los
 * repositorios directamente sobre una base de datos en memoria.
 *
 * Uso: npx tsx scripts/probar-flujo-venta.ts
 */

import path from 'node:path';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { ProductoRepositorioSqlite } from '../src/infraestructura/sqlite/producto.repositorio';
import { ClienteRepositorioSqlite } from '../src/infraestructura/sqlite/cliente.repositorio';
import { VentaRepositorioSqlite } from '../src/infraestructura/sqlite/venta.repositorio';
import { CajaRepositorioSqlite } from '../src/infraestructura/sqlite/caja.repositorio';
import { FiadoRepositorioSqlite } from '../src/infraestructura/sqlite/fiado.repositorio';
import { ProveedorRepositorioSqlite } from '../src/infraestructura/sqlite/proveedor.repositorio';
import { CompraRepositorioSqlite } from '../src/infraestructura/sqlite/compra.repositorio';
import { exportarProductosACsv, exportarVentasACsv } from '../src/core/exportacion';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) {
    throw new Error(`❌ Falló: ${mensaje}`);
  }
  console.log(`✅ ${mensaje}`);
}

async function main() {
  const bd = await BaseDatosLocal.crear({
    localizarArchivo: () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  });

  const productos = new ProductoRepositorioSqlite(bd);
  const clientes = new ClienteRepositorioSqlite(bd);
  const caja = new CajaRepositorioSqlite(bd);
  const ventas = new VentaRepositorioSqlite(bd, productos, caja);
  const fiados = new FiadoRepositorioSqlite(bd, caja);
  const proveedores = new ProveedorRepositorioSqlite(bd);
  const compras = new CompraRepositorioSqlite(bd, productos, caja);

  // --- Producto de prueba ---
  const incaKola = productos.crear({
    nombre: 'Inca Kola 500 ml',
    precioVenta: 4.0,
    costo: 2.8,
    stockActual: 10,
    stockMinimo: 3,
    unidadMedida: 'unidad',
  });
  afirmar(incaKola.id > 0, 'Producto creado con id válido');
  afirmar(incaKola.stockActual === 10, 'Stock inicial correcto');

  // --- Venta en efectivo ---
  const venta1 = ventas.registrarVenta({
    lineas: [{ productoId: incaKola.id, cantidad: 3 }],
    metodoPago: 'efectivo',
  });
  afirmar(venta1.total === 12, `Total de venta en efectivo correcto (obtenido: ${venta1.total})`);
  afirmar(venta1.gananciaEstimada === 3.6, `Ganancia estimada correcta (obtenido: ${venta1.gananciaEstimada})`);

  const productoTrasVenta1 = productos.obtenerPorId(incaKola.id);
  afirmar(productoTrasVenta1.stockActual === 7, `Stock descontado correctamente (obtenido: ${productoTrasVenta1.stockActual})`);
  afirmar(caja.obtenerSaldoActual() === 12, `La caja sube con la venta en efectivo (obtenido: ${caja.obtenerSaldoActual()})`);

  // --- Venta al fiado ---
  const cliente = clientes.crear('Doña Rosa', '123456789101234', '987654321');
  afirmar(cliente.saldoPendiente === 0, 'Cliente nuevo empieza sin deuda');
  afirmar(cliente.documento === '123456789101234', 'El documento del cliente se guarda tal cual');

  let documentoInvalidoFalló = false;
  try {
    clientes.crear('Cliente cualquiera', '123-456'); // guion no permitido
  } catch {
    documentoInvalidoFalló = true;
  }
  afirmar(documentoInvalidoFalló, 'Un documento con caracteres no alfanuméricos es rechazado');

  let documentoLargoFalló = false;
  try {
    clientes.crear('Cliente cualquiera', '1234567890123456'); // 16 caracteres
  } catch {
    documentoLargoFalló = true;
  }
  afirmar(documentoLargoFalló, 'Un documento de más de 15 caracteres es rechazado');

  const clienteDocumentoCorto = clientes.crear('Cliente con DNI corto', '87654321');
  afirmar(
    clienteDocumentoCorto.documento === '87654321',
    'Un documento más corto que 15 caracteres (ej: DNI de 8) SÍ es válido',
  );

  let documentoDuplicadoFalló = false;
  try {
    clientes.crear('Otra persona', '123456789101234'); // mismo documento que Doña Rosa
  } catch {
    documentoDuplicadoFalló = true;
  }
  afirmar(documentoDuplicadoFalló, 'No se puede repetir el documento de un cliente');

  const venta2 = ventas.registrarVenta({
    lineas: [{ productoId: incaKola.id, cantidad: 2 }],
    metodoPago: 'fiado',
    clienteId: cliente.id,
  });
  afirmar(venta2.total === 8, `Total de venta fiada correcto (obtenido: ${venta2.total})`);

  const clienteTrasFiado = clientes.obtenerPorId(cliente.id);
  afirmar(clienteTrasFiado.saldoPendiente === 8, `Deuda del cliente actualizada (obtenido: ${clienteTrasFiado.saldoPendiente})`);
  afirmar(caja.obtenerSaldoActual() === 12, `La venta al fiado NO mueve la caja todavía (obtenido: ${caja.obtenerSaldoActual()})`);

  // --- Pago parcial de la deuda ---
  fiados.registrarPago(cliente.id, 5, 'efectivo');
  const clienteTrasPago = clientes.obtenerPorId(cliente.id);
  afirmar(clienteTrasPago.saldoPendiente === 3, `El pago reduce la deuda correctamente (obtenido: ${clienteTrasPago.saldoPendiente})`);
  afirmar(caja.obtenerSaldoActual() === 17, `El pago de deuda SÍ entra a caja (obtenido: ${caja.obtenerSaldoActual()})`);

  let pagoExcesivoFalló = false;
  try {
    fiados.registrarPago(cliente.id, 999, 'efectivo');
  } catch {
    pagoExcesivoFalló = true;
  }
  afirmar(pagoExcesivoFalló, 'No se puede pagar más de lo que se debe');

  // --- Stock insuficiente debe fallar ---
  let fallóComoEsperado = false;
  try {
    ventas.registrarVenta({ lineas: [{ productoId: incaKola.id, cantidad: 999 }], metodoPago: 'efectivo' });
  } catch {
    fallóComoEsperado = true;
  }
  afirmar(fallóComoEsperado, 'Vender más stock del disponible lanza error de negocio');

  // --- Listado detallado para Inicio (cliente resuelto + preview) ---
  const detalleHoy = ventas.listarDeHoyConDetalle();
  afirmar(detalleHoy.length === 2, `El detalle de hoy lista las 2 ventas (obtenido: ${detalleHoy.length})`);
  afirmar(
    detalleHoy.some((v) => v.clienteNombre === 'Doña Rosa'),
    'El detalle de hoy resuelve el nombre del cliente para la venta al fiado',
  );
  afirmar(
    detalleHoy.some((v) => v.clienteNombre === null),
    'La venta en efectivo sin cliente aparece con clienteNombre null (Cliente eventual en la UI)',
  );

  const lineasVenta1 = ventas.obtenerLineas(venta1.id);
  const primeraLineaVenta1 = lineasVenta1[0];
  afirmar(
    lineasVenta1.length === 1 && primeraLineaVenta1?.cantidad === 3,
    'El preview de líneas de la venta 1 es correcto',
  );

  // --- Anular una venta: repone stock, revierte caja, no cuenta para el histórico ---
  const stockAntesDeAnular = productos.obtenerPorId(incaKola.id).stockActual;
  const cajaAntesDeAnular = caja.obtenerSaldoActual();

  const venta3 = ventas.registrarVenta({
    lineas: [{ productoId: incaKola.id, cantidad: 1 }],
    metodoPago: 'yape',
  });
  afirmar(
    ventas.contarTotalHistorico() === 3,
    `El histórico cuenta la venta 3 antes de anularla (obtenido: ${ventas.contarTotalHistorico()})`,
  );

  ventas.anularVenta(venta3.id);
  const ventaAnulada = ventas.obtenerPorId(venta3.id);
  afirmar(ventaAnulada.anulada, 'La venta anulada queda marcada como anulada');
  afirmar(
    productos.obtenerPorId(incaKola.id).stockActual === stockAntesDeAnular,
    'Anular una venta repone el stock vendido',
  );
  afirmar(
    caja.obtenerSaldoActual() === cajaAntesDeAnular,
    `Anular una venta revierte su efecto en caja (obtenido: ${caja.obtenerSaldoActual()})`,
  );
  afirmar(
    ventas.contarTotalHistorico() === 2,
    `Una venta anulada no cuenta para el histórico (obtenido: ${ventas.contarTotalHistorico()})`,
  );

  let anularDeNuevoFalló = false;
  try {
    ventas.anularVenta(venta3.id);
  } catch {
    anularDeNuevoFalló = true;
  }
  afirmar(anularDeNuevoFalló, 'No se puede anular dos veces la misma venta');

  // --- Resumen del día ---
  const resumen = ventas.resumenDelDia();
  afirmar(resumen.numeroVentas === 2, `El resumen cuenta las 2 ventas válidas (obtenido: ${resumen.numeroVentas})`);
  afirmar(resumen.totalVentas === 20, `El resumen suma S/ 20 en total (obtenido: ${resumen.totalVentas})`);
  afirmar(resumen.totalPorCobrar === 3, `El resumen refleja S/ 3 por cobrar tras el pago (obtenido: ${resumen.totalPorCobrar})`);

  // --- Compra a proveedor: repone stock y sube el costo ---
  const proveedor = proveedores.crear('Distribuidora Central', '999111222');
  const stockAntesDeCompra = productos.obtenerPorId(incaKola.id).stockActual;

  const compra = compras.registrarCompra({
    proveedorId: proveedor.id,
    metodoPago: 'efectivo',
    lineas: [{ productoId: incaKola.id, cantidad: 12, costoUnitario: 3.0 }],
  });
  afirmar(compra.total === 36, `Total de compra correcto (obtenido: ${compra.total})`);

  const productoTrasCompra = productos.obtenerPorId(incaKola.id);
  afirmar(
    productoTrasCompra.stockActual === stockAntesDeCompra + 12,
    `La compra suma al stock (obtenido: ${productoTrasCompra.stockActual})`,
  );
  afirmar(
    productoTrasCompra.costo === 3.0,
    `La compra actualiza el costo del producto (obtenido: ${productoTrasCompra.costo})`,
  );
  afirmar(
    caja.obtenerSaldoActual() === 17 - 36,
    `La compra descuenta de caja (obtenido: ${caja.obtenerSaldoActual()})`,
  );

  // --- Exportación a CSV ---
  const csvProductos = exportarProductosACsv(productos.listarActivos());
  afirmar(
    csvProductos.startsWith('Nombre,Precio de venta,Costo,Stock actual,Stock mínimo,Unidad'),
    'El CSV de productos tiene el encabezado correcto',
  );
  afirmar(csvProductos.includes('Inca Kola 500 ml'), 'El CSV de productos incluye el producto de prueba');

  const csvVentas = exportarVentasACsv(ventas.listarDetalleParaExportar());
  afirmar(
    csvVentas.startsWith('Pedido,Fecha,Producto,Cantidad,Precio unitario,Subtotal,Método de pago,Cliente'),
    'El CSV de ventas tiene la cabecera "Pedido" (correlativo V-N)',
  );
  afirmar(csvVentas.includes(`V-${venta1.id}`), `El CSV incluye el correlativo V-${venta1.id}`);
  afirmar(
    !csvVentas.includes(`V-${venta3.id},`),
    'La venta anulada no aparece en el historial exportado',
  );
  afirmar(
    csvVentas.includes('Cliente Eventual'),
    'El CSV pone "Cliente Eventual" en vez de dejar el campo Cliente vacío',
  );
  afirmar(
    csvVentas.split('\r\n').length === 3, // encabezado + 2 líneas de detalle (una por venta válida)
    `El CSV de ventas tiene una fila por línea vendida (obtenido: ${csvVentas.split('\r\n').length} filas)`,
  );

  console.log('\n🎉 Flujo completo de venta funciona de punta a punta.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
