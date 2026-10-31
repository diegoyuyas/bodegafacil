/**
 * Prueba de cierre de Series y comprobantes (Etapa 4): respaldos y bases ANTIGUAS (anteriores a las series)
 * y respaldos NUEVOS (con series) restaurados en distintas situaciones de Premium.
 *
 * Simula lo que hace «Restaurar respaldo»: abrir los bytes con BaseDatosLocal (dispara las migraciones),
 * exportar y volver a abrir como al iniciar la app.
 *
 * Uso: npx tsx scripts/probar-series-respaldo.ts
 */
import path from 'node:path';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { ConfiguracionRepositorioSqlite } from '../src/infraestructura/sqlite/configuracion.repositorio';
import { ProductoRepositorioSqlite } from '../src/infraestructura/sqlite/producto.repositorio';
import { CajaRepositorioSqlite } from '../src/infraestructura/sqlite/caja.repositorio';
import { VentaRepositorioSqlite } from '../src/infraestructura/sqlite/venta.repositorio';
import { SerieComprobanteRepositorioSqlite } from '../src/infraestructura/sqlite/serie-comprobante.repositorio';
import { CLAVE_PLAN_VENCE_EN } from '../src/core/plan';
import { ErrorDeNegocio } from '../src/core/reglas-negocio';
import { comprobantePorDefecto, comprobantesDisponibles } from '../src/core/comprobantes';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

function lanza(fn: () => unknown): boolean {
  try {
    fn();
  } catch (e) {
    return e instanceof ErrorDeNegocio;
  }
  return false;
}

const localizarArchivo = () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

/** Abre unos bytes como lo hace la app (y «Restaurar respaldo») y arma lo necesario para vender. */
async function abrir(bytes?: Uint8Array) {
  const bd = await BaseDatosLocal.crear({ localizarArchivo, datosPrevios: bytes });
  const configuracion = new ConfiguracionRepositorioSqlite(bd);
  const productos = new ProductoRepositorioSqlite(bd);
  const caja = new CajaRepositorioSqlite(bd);
  const series = new SerieComprobanteRepositorioSqlite(bd, undefined, configuracion);
  const ventas = new VentaRepositorioSqlite(bd, productos, caja, configuracion, undefined, series);
  const premium = (activo: boolean) => configuracion.establecerValor(CLAVE_PLAN_VENCE_EN, activo ? '2099-12-31' : '2000-01-01');
  const esPremium = () => configuracion.obtenerValor(CLAVE_PLAN_VENCE_EN) === '2099-12-31';
  return { bd, configuracion, productos, series, ventas, premium, esPremium };
}

async function main() {
  // ---------- A. Respaldo ANTIGUO (de antes de las series) ----------
  const base = await abrir();
  const producto = base.productos.crear({ nombre: 'Gaseosa', precioVenta: 4, costo: 2, stockActual: 100, stockMinimo: 1, controlaStock: true, unidadMedida: 'unidad' });

  // Se deja la base como estaba antes de las series: sin sus tablas, índice ni columnas.
  base.bd.ejecutar('DROP TABLE usuario_serie');
  base.bd.ejecutar('DROP TABLE serie_comprobante');
  base.bd.ejecutar('DROP INDEX idx_venta_comprobante');
  for (const columna of ['tipo_comprobante', 'serie', 'numero_comprobante']) base.bd.ejecutar(`ALTER TABLE venta DROP COLUMN ${columna}`);
  afirmar(
    !base.bd.consultar<{ name: string }>('PRAGMA table_info(venta)').some((c) => c.name === 'serie') &&
      base.bd.consultar<{ name: string }>("SELECT name FROM sqlite_master WHERE name = 'serie_comprobante'").length === 0,
    'La base de prueba quedó como las de antes de las series (sin tablas ni columnas nuevas)',
  );

  // Ventas «de antes»: dos normales y una anulada.
  const antiguas: number[] = [];
  for (const [total, anulada] of [[10, 0], [25.5, 0], [8, 1]] as const) {
    base.bd.ejecutar(
      "INSERT INTO venta (fecha_hora, metodo_pago, subtotal, total, anulada) VALUES (datetime('now','localtime'), 'efectivo', ?, ?, ?)",
      [total, total, anulada],
    );
    antiguas.push(base.bd.ultimoIdInsertado());
  }
  const respaldoAntiguo = base.bd.exportar();

  // «Restaurar»: abrir los bytes (migra), guardar, y volver a abrir al iniciar la app.
  const restaurada = await abrir(respaldoAntiguo);
  const app = await abrir(restaurada.bd.exportar());

  afirmar(
    app.bd.consultar<{ name: string }>('PRAGMA table_info(venta)').some((c) => c.name === 'numero_comprobante') &&
      app.series.listar().length === 0,
    'Un respaldo antiguo restaurado se migra solo y queda sin series',
  );
  const vistas = antiguas.map((id) => app.ventas.obtenerPorId(id));
  afirmar(
    vistas.every((v, i) => v.tipoComprobante === 'nota_venta' && v.serie === null && v.numeroComprobante === null && v.comprobante === `V-${antiguas[i]}`),
    'Las ventas antiguas quedan como nota de venta, sin número, y se siguen viendo como V-N',
  );
  afirmar(vistas.map((v) => v.total).join() === '10,25.5,8' && vistas[2]!.anulada && !vistas[0]!.anulada, 'Los totales y la venta anulada no cambiaron');
  const hoy = app.bd.consultar<{ d: string }>("SELECT date('now','localtime') AS d")[0]!.d;
  const listadas = app.ventas.listarDeHoyConDetalle();
  afirmar(antiguas.every((id) => listadas.some((v) => v.id === id && v.comprobante === `V-${id}`)), 'La lista de Inicio muestra las ventas antiguas como V-N');
  afirmar(app.ventas.buscarParaReimprimir(hoy, hoy, `V-${antiguas[1]}`).some((v) => v.id === antiguas[1]), 'Se pueden buscar para reimprimir por su V-N de siempre');

  // Sin Premium y sin series: solo nota de venta, como antes.
  afirmar(JSON.stringify(comprobantesDisponibles(app.esPremium(), app.series.listarActivas())) === '["nota_venta"]', 'Sin Premium ni series: solo nota de venta');
  const notaNueva = app.ventas.registrarVenta({ lineas: [{ productoId: producto.id, cantidad: 1 }], metodoPago: 'efectivo' });
  afirmar(notaNueva.comprobante === `V-${notaNueva.id}` && notaNueva.id > antiguas[2]!, 'Una venta nueva sigue el correlativo V-N de siempre');

  // Con Premium el dueño crea su primera serie: la numeración arranca en 1 y NO toca lo anterior.
  app.premium(true);
  const b001 = app.series.crear({ tipo: 'boleta', serie: '001' });
  const primera = app.ventas.registrarVenta({ lineas: [{ productoId: producto.id, cantidad: 1 }], metodoPago: 'efectivo', tipoComprobante: 'boleta' });
  afirmar(primera.comprobante === '001-0000001' && b001.predeterminada, 'La primera boleta de una base antigua sale como 001-0000001');
  afirmar(app.ventas.obtenerPorId(antiguas[0]!).comprobante === `V-${antiguas[0]}`, 'Las ventas antiguas siguen sin número (no se numeran hacia atrás)');
  afirmar(
    comprobantePorDefecto(comprobantesDisponibles(app.esPremium(), app.series.listarActivas())) === 'boleta',
    'Con la primera serie creada, el comprobante por defecto pasa a ser Boleta',
  );

  // ---------- B. Respaldo NUEVO (con series) en un dispositivo con Premium vencido ----------
  app.ventas.registrarVenta({ lineas: [{ productoId: producto.id, cantidad: 1 }], metodoPago: 'efectivo', tipoComprobante: 'boleta' });
  app.series.crear({ tipo: 'factura', serie: '002', siguienteNumero: 501 });
  const respaldoNuevo = app.bd.exportar();

  const otroEquipo = await abrir((await abrir(respaldoNuevo)).bd.exportar());
  otroEquipo.premium(false); // el respaldo no trae el Premium: este equipo lo tiene vencido
  afirmar(otroEquipo.series.listar().length === 2, 'Un respaldo con series se restaura completo (las series viajan en el respaldo)');
  afirmar(JSON.stringify(comprobantesDisponibles(otroEquipo.esPremium(), otroEquipo.series.listarActivas())) === '["nota_venta"]', 'Sin Premium en el equipo, solo nota de venta (nadie queda bloqueado)');
  afirmar(
    lanza(() => otroEquipo.ventas.registrarVenta({ lineas: [{ productoId: producto.id, cantidad: 1 }], metodoPago: 'efectivo', tipoComprobante: 'boleta' })),
    'Sin Premium no se emiten boletas, aunque las series estén guardadas',
  );
  afirmar(
    otroEquipo.ventas.registrarVenta({ lineas: [{ productoId: producto.id, cantidad: 1 }], metodoPago: 'efectivo' }).tipoComprobante === 'nota_venta',
    'Sin Premium se sigue vendiendo con nota de venta',
  );

  // Al volver el Premium, la numeración continúa donde quedó.
  otroEquipo.premium(true);
  const continua = otroEquipo.ventas.registrarVenta({ lineas: [{ productoId: producto.id, cantidad: 1 }], metodoPago: 'efectivo', tipoComprobante: 'boleta' });
  afirmar(continua.comprobante === '001-0000003', 'Al volver el Premium, la boleta continúa en el 3 (la nota de venta no gastó número)');
  afirmar(otroEquipo.series.listar().find((s) => s.serie === '002')?.siguienteNumero === 501, 'La serie de factura conserva su siguiente número (501)');

  // ---------- C. Restaurar dos veces el mismo respaldo no rompe nada ----------
  const unaVez = await abrir(respaldoNuevo);
  const dosVeces = await abrir(unaVez.bd.exportar());
  const tresVeces = await abrir(dosVeces.bd.exportar());
  afirmar(
    tresVeces.series.listar().length === 2 && tresVeces.ventas.obtenerPorId(primera.id).comprobante === '001-0000001',
    'Abrir y restaurar varias veces el mismo respaldo no duplica series ni cambia números',
  );

  // ---------- D. Series antiguas con letras (B001, F001...) de versiones de prueba ----------
  const conLetras = await abrir(respaldoNuevo);
  conLetras.bd.ejecutar("INSERT INTO serie_comprobante (tipo, serie, digitos_numero, siguiente_numero, activo, es_predeterminada) VALUES ('boleta', 'B001', 7, 5, 1, 1)");
  conLetras.bd.ejecutar("INSERT INTO serie_comprobante (tipo, serie, digitos_numero, siguiente_numero, activo, es_predeterminada) VALUES ('factura', 'F001', 7, 3, 1, 1)");
  const idLetras = conLetras.series.listar().find((s) => s.serie === 'B001')!.id;
  conLetras.bd.ejecutar("INSERT INTO venta (metodo_pago, subtotal, total, tipo_comprobante, serie, numero_comprobante) VALUES ('efectivo', 4, 4, 'boleta', 'B001', 4)");
  const ventaConLetras = conLetras.bd.ultimoIdInsertado();

  const migrada = await abrir(conLetras.bd.exportar()); // al abrir, las migraciones desactivan las series con letras
  const antiguas2 = migrada.series.listar().filter((s) => s.serie === 'B001' || s.serie === 'F001');
  afirmar(
    antiguas2.length === 2 && antiguas2.every((s) => !s.activo && !s.predeterminada),
    'Las series antiguas con letras (B001, F001) quedan desactivadas al abrir la app',
  );
  afirmar(
    migrada.series.listar().filter((s) => /^\d{3}$/.test(s.serie)).every((s) => s.activo),
    'Las series de 3 números siguen activas',
  );
  afirmar(
    lanza(() => migrada.series.establecerActiva(idLetras, true)) && lanza(() => migrada.series.crear({ tipo: 'boleta', serie: 'B001' })),
    'Una serie con letras no se puede reactivar ni crear de nuevo',
  );
  afirmar(
    migrada.ventas.obtenerPorId(ventaConLetras).comprobante === 'B001-0000004' && migrada.ventas.obtenerPorId(ventaConLetras).numeroComprobante === 4,
    'Una venta ya emitida con una serie antigua conserva su número (B001-0000004)',
  );
  const otraMigracion = await abrir(migrada.bd.exportar());
  afirmar(
    otraMigracion.series.listar().filter((s) => s.serie === 'B001').every((s) => !s.activo),
    'Abrir la app otra vez no las reactiva',
  );
  migrada.premium(true);
  const nueva = migrada.series.crear({ tipo: 'factura', serie: '010' });
  afirmar(nueva.activo && nueva.serie === '010', 'Se puede crear una serie nueva de 3 números (010) y queda activa');

  console.log('\n🎉 Respaldos y bases antiguas con series: migración, restauración y numeración correctas.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
