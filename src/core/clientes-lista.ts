/**
 * Lógica pura de la pantalla «Clientes» (lista y pop-up de opciones): cómo se rotulan el documento y el celular,
 * qué chips lleva un cliente y qué botones se ofrecen. La pantalla solo muestra lo que decide este módulo.
 */
import type { Cliente } from './tipos';

export type TipoDocumento = 'dni' | 'ruc' | 'doc';

/** DNI = 8 dígitos; RUC = 11 dígitos; cualquier otro documento (carné de extranjería, pasaporte…) = «doc». */
export function tipoDocumento(documento: string | null | undefined): TipoDocumento | null {
  const texto = (documento ?? '').trim();
  if (!texto) return null;
  if (/^\d{8}$/.test(texto)) return 'dni';
  if (/^\d{11}$/.test(texto)) return 'ruc';
  return 'doc';
}

/** Rótulo corto para la lista: «DNI 12345678», «RUC 20123456789», «Doc. CE123». */
const ROTULO_CORTO: Record<TipoDocumento, string> = { dni: 'DNI', ruc: 'RUC', doc: 'Doc.' };

/** Rótulo del cuadro del pop-up; sin documento (o de otro tipo) el cuadro se llama «Documento». */
const ROTULO_CUADRO: Record<TipoDocumento, string> = { dni: 'DNI', ruc: 'RUC', doc: 'Documento' };

/** Celular de 9 dígitos en grupos de 3 («987 654 321») solo para mostrarlo; otro formato se deja como está. */
export function formatearCelular(telefono: string | null | undefined): string | null {
  const texto = (telefono ?? '').trim();
  if (!texto) return null;
  return /^\d{9}$/.test(texto) ? `${texto.slice(0, 3)} ${texto.slice(3, 6)} ${texto.slice(6)}` : texto;
}

/** Datos de la línea bajo el nombre en la lista, cada uno con su rótulo. Lo que falta no se muestra. */
export function datosContactoCliente(cliente: Pick<Cliente, 'documento' | 'telefono'>): string[] {
  const datos: string[] = [];
  const tipo = tipoDocumento(cliente.documento);
  if (tipo) datos.push(`${ROTULO_CORTO[tipo]} ${(cliente.documento ?? '').trim()}`);
  const celular = formatearCelular(cliente.telefono);
  if (celular) datos.push(`Cel. ${celular}`);
  return datos;
}

export interface CuadroResumenCliente {
  clave: 'documento' | 'celular';
  etiqueta: string;
  /** null = el cliente no tiene ese dato (la pantalla muestra «No registrado»). */
  valor: string | null;
}

/** Los dos cuadros del pop-up, siempre en este orden: Documento y Celular. */
export function resumenCliente(cliente: Pick<Cliente, 'documento' | 'telefono'>): CuadroResumenCliente[] {
  const tipo = tipoDocumento(cliente.documento);
  return [
    {
      clave: 'documento',
      etiqueta: ROTULO_CUADRO[tipo ?? 'doc'],
      valor: tipo ? (cliente.documento ?? '').trim() : null,
    },
    { clave: 'celular', etiqueta: 'Celular', valor: formatearCelular(cliente.telefono) },
  ];
}

export type EtiquetaCliente = 'inactivo' | 'deuda';

/** Chips del pop-up, en este orden: Inactivo, Debe. */
export function etiquetasCliente(cliente: Pick<Cliente, 'activo' | 'saldoPendiente'>): EtiquetaCliente[] {
  const etiquetas: EtiquetaCliente[] = [];
  if (!cliente.activo) etiquetas.push('inactivo');
  if (cliente.saldoPendiente > 0) etiquetas.push('deuda');
  return etiquetas;
}

export type BotonOpcionCliente = 'editar' | 'whatsapp';

/** Botones del pop-up, en fila: «WhatsApp» solo existe si el cliente tiene celular. */
export function botonesOpcionesCliente(cliente: Pick<Cliente, 'telefono'>): BotonOpcionCliente[] {
  return cliente.telefono ? ['editar', 'whatsapp'] : ['editar'];
}
