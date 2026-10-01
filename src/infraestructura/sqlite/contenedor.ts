import { BaseDatosLocal } from './base-datos';
import { ProductoRepositorioSqlite } from './producto.repositorio';
import { ClienteRepositorioSqlite } from './cliente.repositorio';
import { VentaRepositorioSqlite } from './venta.repositorio';
import { CajaRepositorioSqlite } from './caja.repositorio';
import { FiadoRepositorioSqlite } from './fiado.repositorio';
import { ProveedorRepositorioSqlite } from './proveedor.repositorio';
import { CompraRepositorioSqlite } from './compra.repositorio';
import { ConfiguracionRepositorioSqlite } from './configuracion.repositorio';
import { PlanRepositorioSqlite } from './plan.repositorio';
import { BloqueoPinRepositorioSqlite } from './bloqueo-pin.repositorio';
import { RespaldoRepositorioSqlite } from './respaldo.repositorio';
import { cargarBinario, guardarBinario } from '../persistencia/almacen-indexeddb';
import { CLAVE_PLAN_FECHA_MAXIMA_VISTA, CLAVE_PLAN_VENCE_EN } from '@/core/plan';

const CLAVE_PERSISTENCIA = 'vende-facil-db';
/** Marca de que ya se retiraron los productos de ejemplo de versiones anteriores (se hace una sola vez). */
const CLAVE_EJEMPLOS_ANTIGUOS_RETIRADOS = 'ejemplos_antiguos_retirados';
/** Bandera: ya se repartieron los abonos antiguos entre las deudas de cada cliente (ver reconciliarFiadosPorDeuda). */
const CLAVE_FIADOS_POR_DEUDA = 'fiados_por_deuda_v1';

export interface ContenedorRepositorios {
  productos: ProductoRepositorioSqlite;
  clientes: ClienteRepositorioSqlite;
  ventas: VentaRepositorioSqlite;
  caja: CajaRepositorioSqlite;
  fiados: FiadoRepositorioSqlite;
  proveedores: ProveedorRepositorioSqlite;
  compras: CompraRepositorioSqlite;
  plan: PlanRepositorioSqlite;
  /** PIN para abrir la app (Más > Configuración > Configurar PIN) — independiente del PIN admin de `plan`. */
  bloqueoPin: BloqueoPinRepositorioSqlite;
  /** Registro de respaldos (tabla metadato_respaldo), usado por el Backup Automático. */
  respaldos: RespaldoRepositorioSqlite;
  /** Acceso crudo clave-valor, usado por la pantalla Más > Configuración para sus switches. */
  configuracion: ConfiguracionRepositorioSqlite;
  /** Guarda el estado actual de la base en IndexedDB. Llamar tras cada escritura. */
  persistir: () => Promise<void>;
  /** Bytes completos de la base, para el respaldo descargable (.sqlite). */
  exportarRespaldoCompleto: () => Uint8Array;
  /**
   * true solo la primera vez que se abre la app en este celular (no
   * había ninguna base local guardada todavía). Se usa para decidir si
   * corresponde mostrar la pantalla de "pedir todos los permisos de
   * una" (ver components/solicitar-permisos-iniciales.tsx) — no tiene
   * relación con si el bodeguero ya respondió esos permisos o no.
   */
  esInstalacionNueva: boolean;
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

  const configuracion = new ConfiguracionRepositorioSqlite(bd);
  const productos = new ProductoRepositorioSqlite(bd);
  const clientes = new ClienteRepositorioSqlite(bd, configuracion);
  const caja = new CajaRepositorioSqlite(bd);
  const ventas = new VentaRepositorioSqlite(bd, productos, caja, configuracion);
  const fiados = new FiadoRepositorioSqlite(bd, caja);
  const proveedores = new ProveedorRepositorioSqlite(bd);
  const compras = new CompraRepositorioSqlite(bd, productos, caja);
  const plan = new PlanRepositorioSqlite(configuracion);
  const bloqueoPin = new BloqueoPinRepositorioSqlite(configuracion);
  const respaldos = new RespaldoRepositorioSqlite(bd);

  const persistir = () => guardarBinario(CLAVE_PERSISTENCIA, bd.exportar());

  if (!datosPrevios) {
    sembrarDatosDeEjemplo(productos, proveedores);
    // Base nueva: no hay nada viejo que retirar. Se marca ya, para que un
    // producto que el bodeguero cree después con un nombre parecido nunca
    // se confunda con un ejemplo antiguo.
    configuracion.establecerValor(CLAVE_EJEMPLOS_ANTIGUOS_RETIRADOS, '1');
    configuracion.establecerValor(CLAVE_FIADOS_POR_DEUDA, '1'); // base nueva: nada antiguo que repartir
    await persistir(); // deja guardados el esquema + los datos de ejemplo
  } else {
    let huboCambios = retirarEjemplosAntiguos(bd, configuracion, productos, proveedores);
    huboCambios = corregirNombreEjemploInkaCola(bd) || huboCambios;
    huboCambios = reconciliarFiadosPorDeuda(bd, configuracion) || huboCambios;
    if (huboCambios) await persistir();
  }

  return {
    productos,
    clientes,
    ventas,
    caja,
    fiados,
    proveedores,
    compras,
    plan,
    bloqueoPin,
    respaldos,
    configuracion,
    persistir,
    exportarRespaldoCompleto: () => bd.exportar(),
    esInstalacionNueva: !datosPrevios,
  };
}

/**
 * Sobrescribe la base local con un respaldo (.sqlite) y recarga la
 * página. Antes de guardar, valida que el archivo sea realmente una
 * base de Vende Fácil (evita dejar la app rota si suben un archivo
 * cualquiera). Se recarga en vez de reasignar en caliente porque todos
 * los repositorios ya instanciados quedarían apuntando a la base
 * vieja; un reload es más simple y a prueba de errores.
 *
 * El respaldo solo debe traer de vuelta la información del negocio
 * (ventas, productos, caja, fiados, compras…) — NUNCA el estado de
 * Premium. Si no fuera así, un respaldo viejo (de cuando quedaban más
 * días) serviría para "revivir" un Premium ya vencido sin pasar por
 * el dueño de la app. Por eso, antes de guardar el archivo restaurado,
 * se pisan esas dos claves con las que ya tenía ESTE dispositivo
 * (`premiumAConservar`), sea cual sea el Premium que traiga el
 * respaldo. Si el bodeguero necesita Premium después de restaurar,
 * tiene que pedir un código de activación nuevo.
 */
export async function restaurarRespaldo(
  datos: Uint8Array,
  premiumAConservar: { venceEn: string | null; fechaMaximaVista: string | null },
): Promise<void> {
  let bdDePrueba: BaseDatosLocal;
  try {
    bdDePrueba = await BaseDatosLocal.crear({
      localizarArchivo: (archivo) => `/${archivo}`,
      datosPrevios: datos,
    });
    bdDePrueba.consultar('SELECT id FROM producto LIMIT 1');
  } catch {
    throw new Error('El archivo no es un respaldo válido de Vende Fácil.');
  }

  const conservarClave = (clave: string, valor: string | null) => {
    if (valor) {
      bdDePrueba.ejecutar(
        `INSERT INTO configuracion_app (clave, valor) VALUES (?, ?)
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
        [clave, valor],
      );
    } else {
      bdDePrueba.ejecutar('DELETE FROM configuracion_app WHERE clave = ?', [clave]);
    }
  };
  conservarClave(CLAVE_PLAN_VENCE_EN, premiumAConservar.venceEn);
  conservarClave(CLAVE_PLAN_FECHA_MAXIMA_VISTA, premiumAConservar.fechaMaximaVista);

  await guardarBinario(CLAVE_PERSISTENCIA, bdDePrueba.exportar());
  window.location.reload();
}

/**
 * Solo para que el proyecto sea usable desde el primer momento en
 * desarrollo. En producción, un bodeguero real empieza con su propio
 * catálogo (Fase 3 del roadmap: CRUD de productos). No duplica: si un
 * ejemplo ya existe (mismo nombre / mismo RUC), no lo vuelve a crear.
 */
function sembrarDatosDeEjemplo(
  productos: ProductoRepositorioSqlite,
  proveedores: ProveedorRepositorioSqlite,
): void {
  const ejemplos = [
    // Producto con control de stock.
    { nombre: 'INCA KOLA 500ML', precioVenta: 3.0, costo: 2.0, stockActual: 20, stockMinimo: 5, controlaStock: true, unidadMedida: 'unidad' },
    // Plato a la carta: sin control de stock (stock y mínimo en 0) y sin costo fijo.
    { nombre: 'LOMO SALTADO', precioVenta: 9.0, costo: 0, stockActual: 0, stockMinimo: 0, controlaStock: false, unidadMedida: 'unidad' },
  ];

  const nombresExistentes = new Set(productos.listarTodos().map((p) => p.nombre));
  for (const ejemplo of ejemplos) {
    if (!nombresExistentes.has(ejemplo.nombre)) productos.crear(ejemplo);
  }

  const RUC_MAKRO = '20492092313';
  if (!proveedores.listarTodos().some((p) => p.ruc === RUC_MAKRO)) {
    proveedores.crear('MAKRO SUPERMAYORISTA S.A.', RUC_MAKRO, '989032563');
  }
}

/**
 * Bases donde ya se había sembrado el ejemplo con el nombre mal
 * escrito "INKA COLA 500ML" (versión anterior de este archivo) lo
 * corrigen a "INCA KOLA 500ML" — sin crear un producto nuevo, para no
 * duplicar. Es idempotente: después de corregirlo una vez, el WHERE
 * ya no encuentra ninguna fila y no hace nada en las siguientes
 * aperturas, así que no necesita su propia bandera de "ya se hizo".
 * Devuelve true si corrigió algo (hay que persistir).
 */
function corregirNombreEjemploInkaCola(bd: BaseDatosLocal): boolean {
  const filas = bd.consultar<{ id: number }>(`SELECT id FROM producto WHERE nombre = 'INKA COLA 500ML'`);
  if (filas.length === 0) return false;
  bd.ejecutar(
    `UPDATE producto SET nombre = 'INCA KOLA 500ML', actualizado_en = datetime('now') WHERE nombre = 'INKA COLA 500ML'`,
  );
  return true;
}

/**
 * Bases ya existentes (instaladas con una versión anterior) todavía traen los
 * dos productos de ejemplo viejos. Se retiran UNA sola vez:
 * - sin ventas ni compras registradas → se borran del todo (con sus movimientos
 *   de inventario);
 * - con historial → no se pueden borrar sin romper reportes (la base lo impide
 *   a propósito), así que quedan como Inactivos.
 * Si se retiró alguno, se agregan los ejemplos nuevos (INCA KOLA 500ML, LOMO
 * SALTADO y el proveedor MAKRO) para que la base quede igual que una nueva.
 * Devuelve true si tocó la base (hay que persistir).
 */
function retirarEjemplosAntiguos(
  bd: BaseDatosLocal,
  configuracion: ConfiguracionRepositorioSqlite,
  productos: ProductoRepositorioSqlite,
  proveedores: ProveedorRepositorioSqlite,
): boolean {
  if (configuracion.obtenerValor(CLAVE_EJEMPLOS_ANTIGUOS_RETIRADOS) === '1') return false;

  const antiguos = bd.consultar<{ id: number }>(
    `SELECT id FROM producto WHERE UPPER(nombre) IN ('INCA KOLA 500 ML', 'AGUA SAN LUIS 625 ML')`,
  );

  for (const { id } of antiguos) {
    const usos =
      bd.consultar<{ n: number }>(
        `SELECT (SELECT COUNT(*) FROM detalle_venta WHERE producto_id = ?)
              + (SELECT COUNT(*) FROM detalle_compra WHERE producto_id = ?) AS n`,
        [id, id],
      )[0]?.n ?? 0;
    if (usos === 0) {
      bd.ejecutar('DELETE FROM movimiento_inventario WHERE producto_id = ?', [id]);
      bd.ejecutar('DELETE FROM producto WHERE id = ?', [id]);
    } else {
      bd.ejecutar(`UPDATE producto SET activo = 0, actualizado_en = datetime('now') WHERE id = ?`, [id]);
    }
  }

  if (antiguos.length > 0) sembrarDatosDeEjemplo(productos, proveedores);
  configuracion.establecerValor(CLAVE_EJEMPLOS_ANTIGUOS_RETIRADOS, '1');
  return true;
}

/**
 * Antes cada abono solo bajaba el saldo TOTAL del cliente: las deudas de cada
 * venta al fiado (`deuda_cliente`) nunca se descontaban, así que no se sabía
 * cuánto se había pagado de cada una. Ahora cada deuda lleva su propio saldo.
 * Para las bases que ya tienen fiados, esto reparte UNA sola vez lo que cada
 * cliente ya pagó entre sus deudas, de la más antigua a la más reciente
 * (FIFO), de modo que la suma de los saldos por venta coincida con el saldo
 * total que el cliente ya tiene hoy (ese número NO cambia). También deja en 0
 * las deudas de ventas que ya estaban anuladas (antes seguían "pendientes" y
 * aparecían en el mensaje de cobranza por WhatsApp).
 * Los abonos históricos de `pago_deuda` no se pueden atribuir a una venta
 * concreta, así que quedan como están. Devuelve true si tocó la base.
 */
function reconciliarFiadosPorDeuda(
  bd: BaseDatosLocal,
  configuracion: ConfiguracionRepositorioSqlite,
): boolean {
  if (configuracion.obtenerValor(CLAVE_FIADOS_POR_DEUDA) === '1') return false;

  bd.ejecutar(
    `UPDATE deuda_cliente SET saldo_pendiente = 0, estado = 'pagada'
     WHERE venta_id IN (SELECT id FROM venta WHERE anulada = 1)`,
  );

  const clientes = bd.consultar<{ id: number; saldo_pendiente: number }>(
    `SELECT DISTINCT c.id AS id, c.saldo_pendiente AS saldo_pendiente
       FROM cliente c JOIN deuda_cliente d ON d.cliente_id = c.id`,
  );

  for (const cliente of clientes) {
    const deudas = bd.consultar<{ id: number; monto: number }>(
      `SELECT id, monto FROM deuda_cliente
       WHERE cliente_id = ? AND saldo_pendiente > 0
       ORDER BY fecha ASC, id ASC`,
      [cliente.id],
    );
    const totalDeudas = deudas.reduce((suma, d) => suma + d.monto, 0);
    let porRepartir = Math.max(0, Math.round((totalDeudas - cliente.saldo_pendiente) * 100) / 100);

    for (const deuda of deudas) {
      if (porRepartir <= 0) break;
      const aplicado = Math.min(porRepartir, deuda.monto);
      const saldo = Math.round((deuda.monto - aplicado) * 100) / 100;
      bd.ejecutar('UPDATE deuda_cliente SET saldo_pendiente = ?, estado = ? WHERE id = ?', [
        saldo,
        saldo <= 0 ? 'pagada' : 'pagada_parcial',
        deuda.id,
      ]);
      porRepartir = Math.round((porRepartir - aplicado) * 100) / 100;
    }
  }

  configuracion.establecerValor(CLAVE_FIADOS_POR_DEUDA, '1');
  return true;
}
