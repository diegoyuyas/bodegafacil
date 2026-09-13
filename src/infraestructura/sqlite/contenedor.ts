import { BaseDatosLocal } from './base-datos';
import { ProductoRepositorioSqlite } from './producto.repositorio';
import { ClienteRepositorioSqlite } from './cliente.repositorio';
import { VentaRepositorioSqlite } from './venta.repositorio';
import { CajaRepositorioSqlite } from './caja.repositorio';
import { FiadoRepositorioSqlite } from './fiado.repositorio';
import { ProveedorRepositorioSqlite } from './proveedor.repositorio';
import { CompraRepositorioSqlite } from './compra.repositorio';
import { cargarBinario, guardarBinario } from '../persistencia/almacen-indexeddb';

const CLAVE_PERSISTENCIA = 'bodega-facil-db';

export interface ContenedorRepositorios {
  productos: ProductoRepositorioSqlite;
  clientes: ClienteRepositorioSqlite;
  ventas: VentaRepositorioSqlite;
  caja: CajaRepositorioSqlite;
  fiados: FiadoRepositorioSqlite;
  proveedores: ProveedorRepositorioSqlite;
  compras: CompraRepositorioSqlite;
  /** Guarda el estado actual de la base en IndexedDB. Llamar tras cada escritura. */
  persistir: () => Promise<void>;
  /** Bytes completos de la base, para el respaldo descargable (.sqlite). */
  exportarRespaldoCompleto: () => Uint8Array;
}

let promesaContenedor: Promise<ContenedorRepositorios> | null = null;

/**
 * Devuelve el contenedor de repositorios, creándolo una sola vez.
 * Solo debe llamarse desde el cliente (navegador): usa IndexedDB y
 * carga el .wasm de sql.js vía HTTP.
 */
export function obtenerContenedor(): Promise<ContenedorRepositorios> {
  if (!promesaContenedor) {
    promesaContenedor = inicializar();
  }
  return promesaContenedor;
}

async function inicializar(): Promise<ContenedorRepositorios> {
  const datosPrevios = await cargarBinario(CLAVE_PERSISTENCIA);

  const bd = await BaseDatosLocal.crear({
    localizarArchivo: (archivo) => `/${archivo}`,
    datosPrevios,
  });

  const productos = new ProductoRepositorioSqlite(bd);
  const clientes = new ClienteRepositorioSqlite(bd);
  const caja = new CajaRepositorioSqlite(bd);
  const ventas = new VentaRepositorioSqlite(bd, productos, caja);
  const fiados = new FiadoRepositorioSqlite(bd, caja);
  const proveedores = new ProveedorRepositorioSqlite(bd);
  const compras = new CompraRepositorioSqlite(bd, productos, caja);

  const persistir = () => guardarBinario(CLAVE_PERSISTENCIA, bd.exportar());

  if (!datosPrevios) {
    sembrarDatosDeEjemplo(productos);
    await persistir(); // deja guardados el esquema + los datos de ejemplo
  }

  return {
    productos,
    clientes,
    ventas,
    caja,
    fiados,
    proveedores,
    compras,
    persistir,
    exportarRespaldoCompleto: () => bd.exportar(),
  };
}

/**
 * Sobrescribe la base local con un respaldo (.sqlite) y recarga la
 * página. Antes de guardar, valida que el archivo sea realmente una
 * base de Bodega Fácil (evita dejar la app rota si suben un archivo
 * cualquiera). Se recarga en vez de reasignar en caliente porque todos
 * los repositorios ya instanciados quedarían apuntando a la base
 * vieja; un reload es más simple y a prueba de errores.
 */
export async function restaurarRespaldo(datos: Uint8Array): Promise<void> {
  let bdDePrueba: BaseDatosLocal;
  try {
    bdDePrueba = await BaseDatosLocal.crear({
      localizarArchivo: (archivo) => `/${archivo}`,
      datosPrevios: datos,
    });
    bdDePrueba.consultar('SELECT id FROM producto LIMIT 1');
  } catch {
    throw new Error('El archivo no es un respaldo válido de Bodega Fácil.');
  }

  await guardarBinario(CLAVE_PERSISTENCIA, datos);
  window.location.reload();
}

/**
 * Solo para que el proyecto sea usable desde el primer momento en
 * desarrollo. En producción, un bodeguero real empieza con su propio
 * catálogo (Fase 3 del roadmap: CRUD de productos).
 */
function sembrarDatosDeEjemplo(productos: ProductoRepositorioSqlite): void {
  const ejemplos = [
    { nombre: 'Inca Kola 500 ml', precioVenta: 4.0, costo: 2.8, stockActual: 24, stockMinimo: 6, unidadMedida: 'unidad' },
    { nombre: 'Agua San Luis 625 ml', precioVenta: 2.0, costo: 1.2, stockActual: 30, stockMinimo: 8, unidadMedida: 'unidad' },
    { nombre: 'Galletas Rellenitas', precioVenta: 3.0, costo: 1.9, stockActual: 20, stockMinimo: 5, unidadMedida: 'unidad' },
    { nombre: 'Pan de molde Bimbo', precioVenta: 7.5, costo: 5.5, stockActual: 10, stockMinimo: 3, unidadMedida: 'unidad' },
    { nombre: 'Cerveza Pilsen 620 ml', precioVenta: 8.0, costo: 6.0, stockActual: 15, stockMinimo: 4, unidadMedida: 'unidad' },
  ];

  for (const ejemplo of ejemplos) {
    productos.crear(ejemplo);
  }
}
