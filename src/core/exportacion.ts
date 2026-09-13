/**
 * Bodega Fácil — Exportación a CSV
 * ------------------------------------------------------------
 * Funciones puras: reciben datos ya consultados y devuelven un string
 * CSV. El efecto de lado (descargar el archivo) vive en
 * `src/infraestructura/exportacion/descargas.ts`, para poder probar
 * el formato del CSV sin un navegador real.
 */

import type { Cliente, Producto } from './tipos';

export interface FilaVentaDetallada {
  fecha: string;
  producto: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  metodoPago: string;
  cliente: string | null;
}

function escaparCsv(valor: string | number | null | undefined): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  if (/[",\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

function filasACsv(
  encabezados: string[],
  filas: (string | number | null | undefined)[][],
): string {
  const lineas = [
    encabezados.map(escaparCsv).join(','),
    ...filas.map((fila) => fila.map(escaparCsv).join(',')),
  ];
  return lineas.join('\r\n');
}

export function exportarVentasACsv(filas: FilaVentaDetallada[]): string {
  return filasACsv(
    ['Fecha', 'Producto', 'Cantidad', 'Precio unitario', 'Subtotal', 'Método de pago', 'Cliente'],
    filas.map((f) => [
      f.fecha,
      f.producto,
      f.cantidad,
      f.precioUnitario,
      f.subtotal,
      f.metodoPago,
      f.cliente,
    ]),
  );
}

export function exportarProductosACsv(productos: Producto[]): string {
  return filasACsv(
    ['Nombre', 'Precio de venta', 'Costo', 'Stock actual', 'Stock mínimo', 'Unidad'],
    productos.map((p) => [p.nombre, p.precioVenta, p.costo, p.stockActual, p.stockMinimo, p.unidadMedida]),
  );
}

export function exportarFiadosACsv(clientes: Cliente[]): string {
  return filasACsv(
    ['Cliente', 'Teléfono', 'Saldo pendiente', 'Último pago'],
    clientes.map((c) => [c.nombre, c.telefono, c.saldoPendiente, c.fechaUltimoPago]),
  );
}
