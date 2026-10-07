/**
 * Vende Fácil — Migraciones
 * ------------------------------------------------------------
 * `esquema.sql` solo se ejecuta en una base NUEVA (vacía). Si el
 * dispositivo ya tenía datos guardados de una versión anterior, hay
 * que ir agregando los cambios de esquema aquí, uno por uno, en
 * orden. Cada sentencia se ejecuta dentro de un try/catch: si ya se
 * aplicó antes (ej. "duplicate column name"), se ignora en silencio.
 * Así el mismo código sirve tanto para una base recién creada (donde
 * esquema.sql ya trae todo) como para una que se está actualizando.
 */

import type { BaseDatosLocal } from './base-datos';

const MIGRACIONES: string[] = [
  // 0001: campo documento de identidad en cliente (Nombre + DNI/CE).
  `ALTER TABLE cliente ADD COLUMN documento TEXT;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_cliente_documento ON cliente(documento) WHERE documento IS NOT NULL;`,
  // 0002: RUC en proveedor, y proveedor "al vuelo" + comprobante en compra.
  `ALTER TABLE proveedor ADD COLUMN ruc TEXT;`,
  `ALTER TABLE compra ADD COLUMN proveedor_nombre_libre TEXT;`,
  `ALTER TABLE compra ADD COLUMN comprobante TEXT;`,
  // 0003: productos que no llevan stock (ej. servicios, recargas) — no descuentan ni bloquean venta.
  `ALTER TABLE producto ADD COLUMN controla_stock INTEGER NOT NULL DEFAULT 1;`,
  // 0004: teléfono usado para WhatsApp en una venta puntual — necesario para poder
  // reenviar el detalle después a un cliente eventual (sin registro de cliente propio).
  `ALTER TABLE venta ADD COLUMN telefono_whatsapp TEXT;`,
  // 0005: foto del comprobante de pago (Yape/Plin, Premium, opcional) — solo la
  // ruta del archivo; la foto en sí se guarda aparte, nunca dentro de esta base.
  `ALTER TABLE venta ADD COLUMN comprobante_pago_ruta TEXT;`,
  // 0006: Más > Compras — listado con Modificar/Anular. Se guarda el método de
  // pago en la propia compra (antes solo quedaba en el movimiento de caja, sin
  // forma de recuperarlo para revertirlo al anular o modificar) y el motivo
  // cuando se anula una compra, igual que ya existe para las ventas.
  `ALTER TABLE compra ADD COLUMN metodo_pago TEXT;`,
  `ALTER TABLE compra ADD COLUMN motivo_anulacion TEXT;`,
  // 0007: Más > Caja / Reportes > Caja — mostrar a quién corresponde cada
  // movimiento (cliente de la venta, proveedor de la compra, o "Ajuste
  // Manual"). Antes solo se sabía por el texto libre del concepto.
  `ALTER TABLE movimiento_caja ADD COLUMN compra_id INTEGER;`,
  `ALTER TABLE movimiento_caja ADD COLUMN cliente_id INTEGER;`,
  // 0008: foto del pago (Yape/Plin) al cobrar un abono de fiado — mismo
  // criterio que la foto de venta.comprobante_pago_ruta.
  `ALTER TABLE pago_deuda ADD COLUMN foto_ruta TEXT;`,
  // 0009: bitácora de cambios manuales a un producto (nombre, precio de
  // venta, costo, stock, stock mínimo) — ver el comentario en la tabla
  // en esquema.sql. `CREATE TABLE IF NOT EXISTS` porque una migración no
  // puede detectar "ya existe" igual que `ALTER TABLE ADD COLUMN` (que
  // arriba se apoya en el error de columna duplicada).
  `CREATE TABLE IF NOT EXISTS producto_historial (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id     INTEGER NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
      campo           TEXT NOT NULL
                          CHECK (campo IN ('nombre','precio_venta','costo','stock','stock_minimo')),
      valor_anterior  TEXT,
      valor_nuevo     TEXT NOT NULL,
      motivo          TEXT,
      fecha           TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_producto_historial_producto ON producto_historial(producto_id, fecha DESC);`,
  // 0010: anular pagos de fiado (Fiados > detalle del cliente > Pagos realizados).
  // Un pago anulado no se borra: se marca, con su motivo y la fecha/hora (del celular).
  `ALTER TABLE pago_deuda ADD COLUMN abono_id INTEGER;`,
  `ALTER TABLE pago_deuda ADD COLUMN anulado INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE pago_deuda ADD COLUMN motivo_anulacion TEXT;`,
  `ALTER TABLE pago_deuda ADD COLUMN fecha_anulacion TEXT;`,
  `CREATE TABLE IF NOT EXISTS bitacora_anulacion_pago (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id          INTEGER REFERENCES cliente(id) ON DELETE SET NULL,
      cliente_nombre      TEXT NOT NULL,
      monto               REAL NOT NULL,
      metodo_pago         TEXT NOT NULL,
      fecha_pago          TEXT NOT NULL,
      motivo              TEXT NOT NULL,
      detalle             TEXT NOT NULL,
      fecha_anulacion     TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_bitacora_anulacion_pago_fecha ON bitacora_anulacion_pago(fecha_anulacion);`,
  // 0011: los movimientos de Caja que son reversas (anulaciones y ajustes por modificación)
  // se marcan aparte para no inflar los totales de Ingresos/Egresos.
  `ALTER TABLE movimiento_caja ADD COLUMN clase TEXT NOT NULL DEFAULT 'normal';`,
  `UPDATE movimiento_caja SET clase = 'anulacion'
     WHERE clase = 'normal' AND (concepto LIKE 'Anulación%' OR concepto LIKE 'Devolución por anulación%');`,
  `UPDATE movimiento_caja SET clase = 'ajuste'
     WHERE clase = 'normal' AND (concepto LIKE 'Ajuste por modificación de compra%' OR concepto LIKE '%(modificada)');`,
  // 0012: el cobro de un fiado cuyo pago se anuló se muestra como "Anulado" en Caja.
  `ALTER TABLE movimiento_caja ADD COLUMN abono_id INTEGER;`,
  `ALTER TABLE movimiento_caja ADD COLUMN pago_anulado INTEGER NOT NULL DEFAULT 0;`,
  // Pagos que ya se habían anulado antes de esta versión: se busca su cobro original
  // por cliente, forma de pago, monto y minuto del pago.
  `UPDATE movimiento_caja SET pago_anulado = 1 WHERE id IN (
     SELECT (SELECT MAX(mc.id) FROM movimiento_caja mc
             WHERE mc.tipo = 'ingreso' AND mc.clase = 'normal'
               AND mc.cliente_id = b.cliente_id AND mc.metodo_pago = b.metodo_pago
               AND ABS(mc.monto - b.monto) < 0.005
               AND mc.concepto LIKE 'Pago de deuda%'
               AND substr(mc.fecha_hora, 1, 16) = substr(b.fecha_pago, 1, 16))
     FROM bitacora_anulacion_pago b);`,
  // 0013: descripción corta por producto en cada venta/compra (Más > Configuración > "Añadir descripción en Venta/Compra").
  `ALTER TABLE detalle_venta ADD COLUMN descripcion TEXT;`,
  `ALTER TABLE detalle_compra ADD COLUMN descripcion TEXT;`,
];

export function aplicarMigraciones(bd: BaseDatosLocal): void {
  for (const sentencia of MIGRACIONES) {
    try {
      bd.ejecutar(sentencia);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message.toLowerCase() : '';
      const yaAplicada =
        mensaje.includes('duplicate column name') || mensaje.includes('already exists');
      if (!yaAplicada) {
        throw error;
      }
    }
  }
}
