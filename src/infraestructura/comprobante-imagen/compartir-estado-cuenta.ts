/**
 * Vende Fácil — Estado de cuenta de un cliente (Fiados > Detalle > Estado de cuenta)
 * ------------------------------------------------------------
 * Arma el estado de cuenta con TODO el historial del cliente y lo comparte como imagen por la hoja nativa
 * «Compartir» de Android (igual que «Guardar ticket como…»), o lo deja listo como texto para WhatsApp.
 * Es un documento interno, sin valor tributario.
 */
import type { ContenedorRepositorios } from '../sqlite/contenedor';
import { leerDatosTiendaParaDocumentos } from '../comprobante/datos-comprobante';
import { descargarImagen } from '../exportacion/descargas';
import { ANCHO_CARACTERES_IMAGEN, generarImagenDeLineas } from './generar-imagen';
import {
  construirEstadoCuenta,
  construirLineasEstadoCuenta,
  fechaCompleta,
  nombreArchivoEstadoCuenta,
  type DatosEstadoCuenta,
} from '@/core/estado-cuenta';
import { hoyLocalSql } from '@/core/tiempo';

/** Junta cliente + historial completo + datos de la tienda. */
export function construirDatosEstadoCuenta(contenedor: ContenedorRepositorios, clienteId: number): DatosEstadoCuenta {
  const cliente = contenedor.clientes.obtenerPorId(clienteId);
  const estado = construirEstadoCuenta(
    cliente,
    contenedor.fiados.listarHistorialFiado(clienteId),
    contenedor.fiados.listarPagosDeCliente(clienteId),
  );
  const { tienda, simboloMoneda } = leerDatosTiendaParaDocumentos(contenedor);
  return { tienda, simboloMoneda, fecha: fechaCompleta(hoyLocalSql()), estado };
}

export async function compartirEstadoCuentaImagen(contenedor: ContenedorRepositorios, clienteId: number): Promise<void> {
  const datos = construirDatosEstadoCuenta(contenedor, clienteId);
  const { logoParaImagen } = leerDatosTiendaParaDocumentos(contenedor);
  const lineas = construirLineasEstadoCuenta(datos, ANCHO_CARACTERES_IMAGEN);
  const blob = await generarImagenDeLineas(lineas, logoParaImagen);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await descargarImagen(nombreArchivoEstadoCuenta(datos.estado.clienteNombre), bytes);
}
