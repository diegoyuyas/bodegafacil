/**
 * Prueba de la fecha de compromiso de pago de Fiados (Etapa F4): atajos, validación, etiquetas,
 * vencimiento, filtro, y con base de datos real: guardar, rechazar, y que se BORRE sola al saldar
 * la deuda (pago total o venta anulada). La migración 0040 se prueba en `probar-migracion.ts`.
 *
 * Uso: npx tsx scripts/probar-fiados-compromiso.ts
 */
import path from 'node:path';
import {
  atajosCompromiso,
  compromisoVigente,
  diasEntre,
  estadoCompromiso,
  etiquetaFechaCorta,
  filtrarCompromisosVencidos,
  sumarDias,
  textoCompromiso,
  validarFechaCompromiso,
} from '../src/core/fiados-compromiso';
import { construirFilasFiado } from '../src/core/fiados-resumen';
import { hoyLocalSql } from '../src/core/tiempo';
import type { Cliente } from '../src/core/tipos';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { CajaRepositorioSqlite } from '../src/infraestructura/sqlite/caja.repositorio';
import { ClienteRepositorioSqlite } from '../src/infraestructura/sqlite/cliente.repositorio';
import { ConfiguracionRepositorioSqlite } from '../src/infraestructura/sqlite/configuracion.repositorio';
import { FiadoRepositorioSqlite } from '../src/infraestructura/sqlite/fiado.repositorio';
import { ProductoRepositorioSqlite } from '../src/infraestructura/sqlite/producto.repositorio';
import { VentaRepositorioSqlite } from '../src/infraestructura/sqlite/venta.repositorio';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

// ================= Parte 1: lógica pura =================
const hoy = '2026-10-31'; // sábado

// ---- Fechas
afirmar(sumarDias('2026-10-31', 1) === '2026-11-01', 'Sumar 1 día cruza el fin de mes');
afirmar(sumarDias('2026-12-31', 1) === '2027-01-01', 'Sumar 1 día cruza el fin de año');
afirmar(sumarDias('2028-02-28', 1) === '2028-02-29' && sumarDias('2026-02-28', 1) === '2026-03-01', 'Febrero: año bisiesto (29) y normal (1 de marzo)');
afirmar(sumarDias('2026-03-01', -1) === '2026-02-28', 'Restar días también funciona');
afirmar(diasEntre('2026-10-31', '2026-11-02') === 2 && diasEntre('2026-11-02', '2026-10-31') === -2 && diasEntre('2026-10-31', '2026-10-31') === 0, 'Días entre fechas (positivo, negativo y cero)');
afirmar(etiquetaFechaCorta('2026-10-30') === 'vie 30/10' && etiquetaFechaCorta('2026-11-06') === 'vie 06/11' && etiquetaFechaCorta('2026-10-31') === 'sáb 31/10', 'Etiqueta corta: día de la semana y día/mes');

// ---- Atajos
const atajos = atajosCompromiso(hoy);
afirmar(atajos.map((a) => a.etiqueta).join(',') === 'Hoy,Mañana,Viernes,En 7 días', 'Atajos: Hoy, Mañana, Viernes y En 7 días');
afirmar(atajos.map((a) => a.fecha).join(',') === '2026-10-31,2026-11-01,2026-11-06,2026-11-07', 'Atajos desde un sábado: viernes = el próximo (6 días)');
afirmar(atajosCompromiso('2026-11-05').map((a) => a.etiqueta).join(',') === 'Hoy,Mañana,En 7 días', 'Si mañana es viernes, no se repite el atajo «Viernes»');
const desdeViernes = atajosCompromiso('2026-11-06');
afirmar(desdeViernes.find((a) => a.id === 'viernes')?.fecha === '2026-11-13', 'Si hoy es viernes, «Viernes» es el de la próxima semana');
afirmar(new Set(desdeViernes.map((a) => a.fecha)).size === desdeViernes.length, 'Nunca hay dos atajos con la misma fecha');
afirmar(atajosCompromiso('basura').length === 0, 'Un «hoy» inválido no genera atajos');

// ---- Validación
afirmar(validarFechaCompromiso('2026-10-31', hoy) === null && validarFechaCompromiso('2026-11-15', hoy) === null, 'Hoy y fechas futuras son válidas');
afirmar(validarFechaCompromiso('2026-10-30', hoy) === 'La fecha no puede ser anterior a hoy.', 'Una fecha pasada se rechaza');
afirmar(validarFechaCompromiso('2026-02-30', hoy) === 'Elige una fecha válida.' && validarFechaCompromiso('abc', hoy) === 'Elige una fecha válida.' && validarFechaCompromiso('', hoy) === 'Elige una fecha válida.', 'Fechas que no existen o mal escritas se rechazan');
afirmar(validarFechaCompromiso('2027-10-31', hoy) === null, 'Dentro de exactamente un año es válida');
afirmar(validarFechaCompromiso('2027-11-01', hoy) === 'Elige una fecha dentro del próximo año.', 'Más de un año adelante se rechaza');

// ---- Estado y texto
afirmar(estadoCompromiso(null, hoy) === 'ninguno' && estadoCompromiso('basura', hoy) === 'ninguno', 'Sin fecha (o mal escrita): sin compromiso');
afirmar(estadoCompromiso('2026-11-01', hoy) === 'pendiente', 'Compromiso futuro: pendiente');
afirmar(estadoCompromiso('2026-10-31', hoy) === 'hoy', 'El mismo día del compromiso todavía NO se pasó (hoy)');
afirmar(estadoCompromiso('2026-10-30', hoy) === 'vencido', 'Al día siguiente ya se pasó (vencido)');
afirmar(estadoCompromiso('2026-11-01', '2026-10-31') === 'pendiente' && estadoCompromiso('2026-11-01', '2026-11-01') === 'hoy' && estadoCompromiso('2026-11-01', '2026-11-02') === 'vencido', 'El mismo compromiso cambia con el día: pendiente → hoy → vencido');
afirmar(estadoCompromiso('2026-12-31', '2027-01-01') === 'vencido', 'Cambio de año: el compromiso del 31/12 vence el 01/01');
afirmar(textoCompromiso(null, hoy) === '', 'Sin compromiso no hay etiqueta');
afirmar(textoCompromiso('2026-10-31', hoy) === 'Pagará hoy' && textoCompromiso('2026-11-01', hoy) === 'Pagará mañana', 'Etiquetas: «Pagará hoy» y «Pagará mañana»');
afirmar(textoCompromiso('2026-11-06', hoy) === 'Pagará el vie 06/11', 'Etiqueta: «Pagará el vie 06/11»');
afirmar(textoCompromiso('2026-10-30', hoy) === 'Se pasó el compromiso · vie 30/10', 'Etiqueta vencida: «Se pasó el compromiso · vie 30/10»');
afirmar(compromisoVigente('2026-11-06', 10) === '2026-11-06' && compromisoVigente('2026-11-06', 0) === null, 'Un compromiso de quien ya no debe nada se ignora');

// ---- Filtro «Compromisos vencidos»
function cliente(id: number, saldo: number, fecha: string | null): Cliente {
  return { id, nombre: `C${id}`, documento: null, telefono: null, direccion: null, saldoPendiente: saldo, fechaUltimoPago: null, ultimoRecordatorioEn: null, fechaCompromiso: fecha, activo: true, creadoEn: '2026-01-01 08:00:00' };
}
const filas = construirFilasFiado([cliente(1, 50, '2026-10-30'), cliente(2, 50, '2026-10-31'), cliente(3, 50, '2026-11-05'), cliente(4, 50, null), cliente(5, 0, '2026-10-01')], []);
afirmar(filtrarCompromisosVencidos(filas, hoy).map((f) => f.cliente.id).join(',') === '1', 'Filtro: solo el cliente cuyo compromiso ya pasó y aún debe (no hoy, no futuro, no sin fecha, no saldado)');
afirmar(filtrarCompromisosVencidos(filas, '2026-11-01').map((f) => f.cliente.id).join(',') === '1,2', 'Al día siguiente, el que se comprometió para ayer también entra al filtro');
afirmar(filtrarCompromisosVencidos([], hoy).length === 0, 'Filtro sobre lista vacía no falla');

// ================= Parte 2: con base de datos real =================
async function conBaseDeDatos() {
  const bd = await BaseDatosLocal.crear({
    localizarArchivo: () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  });
  const configuracion = new ConfiguracionRepositorioSqlite(bd);
  const productos = new ProductoRepositorioSqlite(bd);
  const clientes = new ClienteRepositorioSqlite(bd, configuracion);
  const caja = new CajaRepositorioSqlite(bd);
  const ventas = new VentaRepositorioSqlite(bd, productos, caja, configuracion);
  const fiados = new FiadoRepositorioSqlite(bd, caja);

  const arroz = productos.crear({ nombre: 'Arroz', costo: 2, precioVenta: 10, stockActual: 50, stockMinimo: 1, controlaStock: true, unidadMedida: 'unidad' });
  const hoyReal = hoyLocalSql();
  const rosa = clientes.crear('Doña Rosa', 'ROSA001', '987654321');
  const pedro = clientes.crear('Pedro', 'PEDRO01', '912345678');
  const sinDeuda = clientes.crear('Sin deuda', 'SIN0001', null);

  afirmar(clientes.obtenerPorId(rosa.id).fechaCompromiso === null, 'Un cliente nuevo nace sin compromiso de pago');

  const ventaRosa = ventas.registrarVenta({ lineas: [{ productoId: arroz.id, cantidad: 3 }], metodoPago: 'fiado', clienteId: rosa.id }); // debe 30
  const ventaPedro = ventas.registrarVenta({ lineas: [{ productoId: arroz.id, cantidad: 2 }], metodoPago: 'fiado', clienteId: pedro.id }); // debe 20

  // Guardar y quitar
  const en3 = sumarDias(hoyReal, 3);
  clientes.guardarFechaCompromiso(rosa.id, en3);
  afirmar(clientes.obtenerPorId(rosa.id).fechaCompromiso === en3, 'Se guarda la fecha de compromiso de un cliente que debe');
  clientes.guardarFechaCompromiso(rosa.id, null);
  afirmar(clientes.obtenerPorId(rosa.id).fechaCompromiso === null, 'Se puede quitar el compromiso');
  clientes.guardarFechaCompromiso(rosa.id, hoyReal);
  afirmar(clientes.obtenerPorId(rosa.id).fechaCompromiso === hoyReal, 'Se puede poner «hoy» como fecha de compromiso');

  // Rechazos (y no pisan lo guardado)
  const rechazo = (id: number, fecha: string) => {
    try {
      clientes.guardarFechaCompromiso(id, fecha);
      return '';
    } catch (e) {
      return e instanceof Error ? e.message : 'error';
    }
  };
  afirmar(rechazo(rosa.id, sumarDias(hoyReal, -1)) === 'La fecha no puede ser anterior a hoy.', 'Una fecha pasada se rechaza al guardar');
  afirmar(rechazo(rosa.id, '2026-02-30') === 'Elige una fecha válida.', 'Una fecha inexistente se rechaza al guardar');
  afirmar(clientes.obtenerPorId(rosa.id).fechaCompromiso === hoyReal, 'Un rechazo no pisa el compromiso que ya estaba');
  afirmar(rechazo(sinDeuda.id, en3).startsWith('Este cliente no tiene deuda'), 'No se puede poner compromiso a quien no debe nada');
  afirmar(rechazo(9999, en3) !== '', 'Un cliente que no existe se rechaza');
  afirmar(clientes.guardarFechaCompromiso(sinDeuda.id, null) === undefined, 'Quitar el compromiso de quien no debe nada no falla');

  // Pago parcial conserva; pago total borra
  clientes.guardarFechaCompromiso(rosa.id, en3);
  fiados.registrarPago(rosa.id, 10, 'efectivo');
  afirmar(clientes.obtenerPorId(rosa.id).saldoPendiente === 20 && clientes.obtenerPorId(rosa.id).fechaCompromiso === en3, 'Un pago parcial NO borra el compromiso (sigue debiendo 20)');
  fiados.registrarPago(rosa.id, 20, 'efectivo');
  afirmar(clientes.obtenerPorId(rosa.id).saldoPendiente === 0 && clientes.obtenerPorId(rosa.id).fechaCompromiso === null, 'Al pagar toda la deuda, el compromiso se borra solo');

  // Anular la venta fiada también salda y borra
  clientes.guardarFechaCompromiso(pedro.id, en3);
  ventas.anularVenta(ventaPedro.id, 'se equivocó');
  afirmar(clientes.obtenerPorId(pedro.id).saldoPendiente === 0 && clientes.obtenerPorId(pedro.id).fechaCompromiso === null, 'Al anular la venta fiada y quedar sin deuda, el compromiso se borra solo');

  // Si después vuelve a deber, empieza sin compromiso
  ventas.registrarVenta({ lineas: [{ productoId: arroz.id, cantidad: 1 }], metodoPago: 'fiado', clienteId: rosa.id });
  afirmar(clientes.obtenerPorId(rosa.id).saldoPendiente === 10 && clientes.obtenerPorId(rosa.id).fechaCompromiso === null, 'Si vuelve a fiar, no hereda el compromiso anterior');
  void ventaRosa;
}

conBaseDeDatos()
  .then(() => console.log('🎉 Todas las pruebas de Fiados F4 pasaron.'))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
