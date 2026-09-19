import type { ContenedorRepositorios } from '../sqlite/contenedor';
import { CLAVE_IMPRESORA_ACTIVA, CLAVE_IMPRESORA_DIRECCION } from '@/core/impresora';
import { CLAVE_NOMBRE_TIENDA, obtenerNombreTienda } from '@/core/configuracion';
import {
  CLAVE_TIENDA_CONTACTO,
  CLAVE_TIENDA_DOCUMENTO,
  CLAVE_TIENDA_LEYENDA,
  CLAVE_TIENDA_UBICACION,
} from '@/core/informacion-tienda';
import { CLAVE_MONEDA, obtenerSimboloMoneda } from '@/core/moneda';
import { construirTextoComprobante, type DatosComprobante } from '@/core/comprobante-impresion';
import { imprimirEn } from './impresora';

function fechaHoraLegibles(fechaHoraSql: string): { fecha: string; hora: string } {
  const [fecha = '', hora = ''] = fechaHoraSql.split(' ');
  const [anio = '', mes = '', dia = ''] = fecha.split('-');
  return { fecha: `${dia}/${mes}/${anio}`, hora: hora.slice(0, 5) };
}

/**
 * Imprime el comprobante de una venta ya registrada (recién hecha o
 * antigua, da igual — se reconstruye todo desde la base). Lanza un
 * error con mensaje legible si la impresión Bluetooth no está
 * activada, no hay impresora elegida, o falla la conexión.
 */
export async function imprimirComprobanteDeVenta(
  contenedor: ContenedorRepositorios,
  ventaId: number,
): Promise<void> {
  const c = contenedor.configuracion;

  if (c.obtenerValor(CLAVE_IMPRESORA_ACTIVA) !== '1') {
    throw new Error('Activa la impresión Bluetooth en Más > Configuración de Impresoras.');
  }
  const direccion = c.obtenerValor(CLAVE_IMPRESORA_DIRECCION);
  if (!direccion) {
    throw new Error('No hay ninguna impresora elegida en Más > Configuración de Impresoras.');
  }

  const venta = contenedor.ventas.obtenerPorId(ventaId);
  const lineas = contenedor.ventas.obtenerLineasParaMensaje(ventaId);
  const cliente = venta.clienteId ? contenedor.clientes.obtenerPorId(venta.clienteId) : null;
  const { fecha, hora } = fechaHoraLegibles(venta.fechaHora);

  const datos: DatosComprobante = {
    numeroComprobante: `V-${venta.id}`,
    fecha,
    hora,
    clienteNombre: cliente?.nombre ?? 'Cliente Eventual',
    clienteDocumento: cliente?.documento ?? null,
    lineas: lineas.map((l) => ({
      descripcion: l.producto,
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      subtotal: l.subtotal,
    })),
    total: venta.total,
    metodoPago: venta.metodoPago,
    simboloMoneda: obtenerSimboloMoneda(c.obtenerValor(CLAVE_MONEDA)),
    tienda: {
      nombre: obtenerNombreTienda(c.obtenerValor(CLAVE_NOMBRE_TIENDA)),
      documento: c.obtenerValor(CLAVE_TIENDA_DOCUMENTO),
      ubicacion: c.obtenerValor(CLAVE_TIENDA_UBICACION),
      contacto: c.obtenerValor(CLAVE_TIENDA_CONTACTO),
      leyenda: c.obtenerValor(CLAVE_TIENDA_LEYENDA),
    },
  };

  await imprimirEn(direccion, construirTextoComprobante(datos));
}
