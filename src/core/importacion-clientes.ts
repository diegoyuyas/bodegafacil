/**
 * Vende Fácil — Importación masiva de clientes (Más > Importar Datos > Importar Clientes)
 * ------------------------------------------------------------
 * Mismo espíritu que `importacion-productos.ts`: función pura, sin
 * DOM ni SQLite. `clientes.crear(nombre, documento, telefono)` exige
 * documento (alfanumérico, hasta 15 caracteres) y único — por eso acá
 * el documento es obligatorio y se valida como duplicado (a
 * diferencia de productos, que dedupica por nombre).
 */

import type { HojaExcel } from './exportacion';

export const ENCABEZADOS_IMPORTAR_CLIENTES = ['nombre_cliente', 'documento', 'telefono'];

const PATRON_DOCUMENTO = /^[A-Za-z0-9]{1,15}$/;
const PATRON_CELULAR = /^[0-9]{6,12}$/;

export function construirPlantillaImportarClientes(): HojaExcel {
  return {
    nombre: 'Clientes',
    encabezados: ENCABEZADOS_IMPORTAR_CLIENTES,
    filas: [
      ['Juana Pérez', '45678912', '987654321'],
      ['Carlos Ramos', '10029384756', ''],
    ],
  };
}

export interface DatosClienteImportado {
  nombre: string;
  documento: string;
  telefono: string | null;
}

export interface FilaImportadaCliente {
  numeroFila: number;
  datos: DatosClienteImportado | null;
  errores: string[];
}

function celdaVacia(valor: unknown): boolean {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

export function filaEstaVacia(valores: unknown[]): boolean {
  return valores.every(celdaVacia);
}

/**
 * - nombre: obligatorio.
 * - documento: obligatorio, alfanumérico, hasta 15 caracteres (mismo
 *   patrón que `validarDocumentoIdentidad` en `reglas-negocio.ts`).
 * - telefono: opcional; si se da, solo dígitos, entre 6 y 12.
 */
export function parsearFilaImportacionCliente(valores: unknown[], numeroFila: number): FilaImportadaCliente {
  const [nombreCrudo, documentoCrudo, telefonoCrudo] = valores;
  const errores: string[] = [];

  const nombre = celdaVacia(nombreCrudo) ? '' : String(nombreCrudo).trim();
  if (!nombre) errores.push('El nombre del cliente es obligatorio.');

  const documento = celdaVacia(documentoCrudo) ? '' : String(documentoCrudo).trim();
  if (!documento) errores.push('El documento es obligatorio.');
  else if (!PATRON_DOCUMENTO.test(documento)) {
    errores.push('El documento debe ser alfanumérico, de hasta 15 caracteres.');
  }

  let telefono: string | null = null;
  if (!celdaVacia(telefonoCrudo)) {
    const textoTelefono = String(telefonoCrudo).trim();
    if (!PATRON_CELULAR.test(textoTelefono)) {
      errores.push('El teléfono debe tener solo números, entre 6 y 12 dígitos.');
    } else {
      telefono = textoTelefono;
    }
  }

  if (errores.length > 0) {
    return { numeroFila, datos: null, errores };
  }

  return { numeroFila, errores: [], datos: { nombre, documento, telefono } };
}

/**
 * Segunda pasada: marca como error los documentos que ya existen en la
 * base o repetidos dentro del mismo archivo — mismo patrón que
 * `marcarDuplicados` de productos, pero comparando por documento (el
 * campo realmente único en `cliente`), no por nombre.
 */
export function marcarDuplicadosCliente(
  filas: FilaImportadaCliente[],
  documentosExistentes: Set<string>,
): FilaImportadaCliente[] {
  const vistosEnElArchivo = new Set<string>();

  return filas.map((fila) => {
    if (!fila.datos) return fila;

    const clave = fila.datos.documento.trim().toLowerCase();

    if (documentosExistentes.has(clave)) {
      return {
        ...fila,
        datos: null,
        errores: [`Ya existe un cliente con el documento ${fila.datos.documento}.`],
      };
    }
    if (vistosEnElArchivo.has(clave)) {
      return {
        ...fila,
        datos: null,
        errores: [`El documento ${fila.datos.documento} está repetido dentro de este mismo archivo.`],
      };
    }

    vistosEnElArchivo.add(clave);
    return fila;
  });
}
