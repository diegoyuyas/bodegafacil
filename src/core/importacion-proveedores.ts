/**
 * Vende Fácil — Importación masiva de proveedores (Más > Importar Datos > Importar Proveedores)
 * ------------------------------------------------------------
 * Mismo espíritu que `importacion-productos.ts` / `importacion-clientes.ts`.
 * `proveedores.crear(nombre, ruc?, telefono?)` no exige RUC (a
 * diferencia del documento de cliente), así que acá se dedupica por
 * nombre — igual que productos.
 */

import type { HojaExcel } from './exportacion';

export const ENCABEZADOS_IMPORTAR_PROVEEDORES = ['nombre_proveedor', 'ruc', 'telefono'];

const PATRON_RUC = /^[A-Za-z0-9]{1,15}$/;
const PATRON_CELULAR = /^[0-9]{6,12}$/;

export function construirPlantillaImportarProveedores(): HojaExcel {
  return {
    nombre: 'Proveedores',
    encabezados: ENCABEZADOS_IMPORTAR_PROVEEDORES,
    filas: [
      ['Distribuidora Los Andes', '20123456789', '987654321'],
      ['Juan (proveedor de abarrotes)', '', ''],
    ],
  };
}

export interface DatosProveedorImportado {
  nombre: string;
  ruc: string | null;
  telefono: string | null;
}

export interface FilaImportadaProveedor {
  numeroFila: number;
  datos: DatosProveedorImportado | null;
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
 * - ruc: opcional; si se da, alfanumérico hasta 15 caracteres.
 * - telefono: opcional; si se da, solo dígitos, entre 6 y 12.
 */
export function parsearFilaImportacionProveedor(
  valores: unknown[],
  numeroFila: number,
): FilaImportadaProveedor {
  const [nombreCrudo, rucCrudo, telefonoCrudo] = valores;
  const errores: string[] = [];

  const nombre = celdaVacia(nombreCrudo) ? '' : String(nombreCrudo).trim();
  if (!nombre) errores.push('El nombre del proveedor es obligatorio.');

  let ruc: string | null = null;
  if (!celdaVacia(rucCrudo)) {
    const textoRuc = String(rucCrudo).trim();
    if (!PATRON_RUC.test(textoRuc)) {
      errores.push('El RUC debe ser alfanumérico, de hasta 15 caracteres.');
    } else {
      ruc = textoRuc;
    }
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

  return { numeroFila, errores: [], datos: { nombre, ruc, telefono } };
}

/** Dedupica por nombre (en la base y dentro del propio archivo) — mismo patrón que productos. */
export function marcarDuplicadosProveedor(
  filas: FilaImportadaProveedor[],
  nombresExistentes: Set<string>,
): FilaImportadaProveedor[] {
  const vistosEnElArchivo = new Set<string>();

  return filas.map((fila) => {
    if (!fila.datos) return fila;

    const clave = fila.datos.nombre.trim().toLowerCase();

    if (nombresExistentes.has(clave)) {
      return {
        ...fila,
        datos: null,
        errores: [`Ya existe un proveedor llamado "${fila.datos.nombre}".`],
      };
    }
    if (vistosEnElArchivo.has(clave)) {
      return {
        ...fila,
        datos: null,
        errores: [`"${fila.datos.nombre}" está repetido dentro de este mismo archivo.`],
      };
    }

    vistosEnElArchivo.add(clave);
    return fila;
  });
}
