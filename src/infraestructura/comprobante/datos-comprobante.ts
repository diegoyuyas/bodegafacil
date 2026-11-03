/**
 * Junta venta + información de la tienda en un `DatosComprobante` —
 * usado tanto por la impresora Bluetooth (`imprimir-venta.ts`) como
 * por "Guardar ticket como..." (`comprobante-imagen/compartir-ticket.ts`),
 * para no armar esto dos veces.
 */
import type { ContenedorRepositorios } from '../sqlite/contenedor';
import { CLAVE_CONTROL_USUARIOS, CLAVE_NOMBRE_TIENDA, controlUsuariosVigente, obtenerNombreTienda } from '@/core/configuracion';
import {
  CLAVE_TIENDA_CONTACTO,
  CLAVE_TIENDA_DOCUMENTO,
  CLAVE_TIENDA_LEYENDA,
  CLAVE_TIENDA_UBICACION,
  CLAVE_TIENDA_VENDEDOR,
} from '@/core/informacion-tienda';
import { CLAVE_MONEDA, obtenerSimboloMoneda } from '@/core/moneda';
import { CLAVE_LOGO_DATOS, CLAVE_LOGO_EN_IMAGEN, esLogoValido, logoEnImagenActivo } from '@/core/logo';
import type { DatosComprobante } from '@/core/comprobante-impresion';

function fechaHoraLegibles(fechaHoraSql: string): { fecha: string; hora: string } {
  const [fecha = '', hora = ''] = fechaHoraSql.split(' ');
  const [anio = '', mes = '', dia = ''] = fecha.split('-');
  return { fecha: `${dia}/${mes}/${anio}`, hora: hora.slice(0, 5) };
}

/**
 * Quién figura como vendedor en el ticket (impreso y en imagen):
 *  - con el control de usuarios rigiendo y la venta hecha por un usuario: el nombre de ESE usuario;
 *  - en cualquier otro caso (sin control de usuarios, o venta hecha antes del control): el nombre de
 *    vendedor de Más > Configuración > Información del Negocio.
 */
function nombreDelVendedor(contenedor: ContenedorRepositorios, usuarioIdDeLaVenta: number | null): string | null {
  const configurado = contenedor.configuracion.obtenerValor(CLAVE_TIENDA_VENDEDOR);
  if (usuarioIdDeLaVenta === null) return configurado;
  const rige = controlUsuariosVigente(
    contenedor.configuracion.obtenerValor(CLAVE_CONTROL_USUARIOS),
    contenedor.plan.obtenerEstado().tipo === 'premium',
  );
  if (!rige) return configurado;
  try {
    return contenedor.usuarios.obtenerPorId(usuarioIdDeLaVenta).nombre;
  } catch {
    return configurado;
  }
}

/** Datos de la tienda (nombre, documento, ubicación…), logotipo y moneda, para cualquier documento que se comparta. */
export function leerDatosTiendaParaDocumentos(contenedor: ContenedorRepositorios): {
  tienda: DatosComprobante['tienda'];
  logoParaImagen: string | null;
  simboloMoneda: string;
} {
  const c = contenedor.configuracion;
  const logo = c.obtenerValor(CLAVE_LOGO_DATOS);
  return {
    tienda: {
      nombre: obtenerNombreTienda(c.obtenerValor(CLAVE_NOMBRE_TIENDA)),
      documento: c.obtenerValor(CLAVE_TIENDA_DOCUMENTO),
      ubicacion: c.obtenerValor(CLAVE_TIENDA_UBICACION),
      contacto: c.obtenerValor(CLAVE_TIENDA_CONTACTO),
      leyenda: c.obtenerValor(CLAVE_TIENDA_LEYENDA),
    },
    logoParaImagen: logoEnImagenActivo(c.obtenerValor(CLAVE_LOGO_EN_IMAGEN)) && esLogoValido(logo) ? logo : null,
    simboloMoneda: obtenerSimboloMoneda(c.obtenerValor(CLAVE_MONEDA)),
  };
}

export function construirDatosComprobanteDeVenta(
  contenedor: ContenedorRepositorios,
  ventaId: number,
): DatosComprobante {
  const c = contenedor.configuracion;
  const venta = contenedor.ventas.obtenerPorId(ventaId);
  const lineas = contenedor.ventas.obtenerLineasParaMensaje(ventaId);
  const cliente = venta.clienteId ? contenedor.clientes.obtenerPorId(venta.clienteId) : null;
  const { fecha, hora } = fechaHoraLegibles(venta.fechaHora);

  // Todo ticket dice «DOCUMENTO INTERNO» y, debajo, la serie y el número (001-0000123). En las notas de venta
  // (y las ventas anteriores a las series) el número es el de siempre, V-N; en boleta/factura la referencia V-N va aparte.
  const tieneSerie = venta.tipoComprobante !== 'nota_venta' && venta.serie !== null && venta.numeroComprobante !== null;

  const logo = c.obtenerValor(CLAVE_LOGO_DATOS);
  const logoParaImagen = logoEnImagenActivo(c.obtenerValor(CLAVE_LOGO_EN_IMAGEN)) && esLogoValido(logo) ? logo : null;

  return {
    numeroComprobante: venta.comprobante,
    logoParaImagen,
    referenciaPedido: tieneSerie ? `V-${venta.id}` : null,
    etiquetaDocumentoCliente: venta.tipoComprobante === 'factura' ? 'RUC' : 'DNI',
    fecha,
    hora,
    nombreVendedor: nombreDelVendedor(contenedor, venta.usuarioId),
    clienteNombre: cliente?.nombre ?? venta.clienteNombreLibre ?? 'Cliente Eventual',
    clienteDocumento: cliente?.documento ?? null,
    lineas: lineas.map((l) => ({
      descripcion: l.producto,
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      subtotal: l.subtotal,
      nota: l.descripcion,
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
}
