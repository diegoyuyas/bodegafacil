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
  // 0014: tipo de producto. 'venta_compra' (todos los productos que ya existían) o
  // 'insumo' (solo sirve para Compras: sin stock ni precio de venta, no sale a vender).
  `ALTER TABLE producto ADD COLUMN tipo TEXT NOT NULL DEFAULT 'venta_compra' CHECK (tipo IN ('venta_compra','insumo'));`,
  // 0015: nombre de cliente escrito a mano en Nueva venta (sin registrarlo). Reemplaza a "Cliente Eventual" solo en esa venta.
  `ALTER TABLE venta ADD COLUMN cliente_nombre_libre TEXT;`,
  // 0016: alias del producto (otros nombres con que se le conoce), separados por coma. Para la venta por voz.
  // No se registra en producto_historial (su CHECK tiene una lista fija de campos).
  `ALTER TABLE producto ADD COLUMN alias TEXT;`,
  // 0017: usuarios (control de usuarios, Premium). La contraseña nunca se guarda: solo su huella PBKDF2 con sal.
  `CREATE TABLE IF NOT EXISTS usuario (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre              TEXT NOT NULL,
      nombre_clave        TEXT NOT NULL UNIQUE,
      rol                 TEXT NOT NULL DEFAULT 'estandar'
                              CHECK (rol IN ('administrador','estandar')),
      clave_hash          TEXT NOT NULL,
      clave_sal           TEXT NOT NULL,
      clave_iteraciones   INTEGER NOT NULL,
      activo              INTEGER NOT NULL DEFAULT 1,
      intentos_fallidos   INTEGER NOT NULL DEFAULT 0,
      bloqueado_hasta     INTEGER,
      ultimo_acceso       TEXT,
      creado_en           TEXT NOT NULL DEFAULT (datetime('now')),
      actualizado_en      TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  // 0018 a 0021: quién registró cada venta, compra, cobro de fiado y movimiento de caja (control de usuarios).
  // NULL = hecho antes de que existiera el control o sin él.
  `ALTER TABLE venta ADD COLUMN usuario_id INTEGER;`,
  `ALTER TABLE compra ADD COLUMN usuario_id INTEGER;`,
  `ALTER TABLE movimiento_caja ADD COLUMN usuario_id INTEGER;`,
  `ALTER TABLE pago_deuda ADD COLUMN usuario_id INTEGER;`,
  // 0022 y 0023: actividad de usuarios (quién hizo cada acción delicada y quién la autorizó).
  `CREATE TABLE IF NOT EXISTS actividad_usuario (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha_hora      TEXT NOT NULL,
      usuario_id      INTEGER NOT NULL REFERENCES usuario(id),
      accion          TEXT NOT NULL,
      entidad         TEXT NOT NULL,
      entidad_id      INTEGER,
      detalle         TEXT,
      autorizado_por  INTEGER REFERENCES usuario(id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_actividad_usuario_fecha ON actividad_usuario(fecha_hora);`,
  // 0024 a 0030: quién y cuándo anuló o modificó cada transacción (columnas de usuario y fecha de los Excel).
  `ALTER TABLE venta ADD COLUMN anulada_por INTEGER;`,
  `ALTER TABLE venta ADD COLUMN fecha_anulacion TEXT;`,
  `ALTER TABLE compra ADD COLUMN anulada_por INTEGER;`,
  `ALTER TABLE compra ADD COLUMN fecha_anulacion TEXT;`,
  `ALTER TABLE compra ADD COLUMN modificada_por INTEGER;`,
  `ALTER TABLE compra ADD COLUMN fecha_modificacion TEXT;`,
  `ALTER TABLE pago_deuda ADD COLUMN anulado_por INTEGER;`,
  // 0031 a 0034: tipo, serie y número del comprobante de cada venta (Series y comprobantes, Premium).
  // Las ventas anteriores quedan como nota de venta, sin serie ni número (no se numeran hacia atrás).
  // Las columnas nuevas de una tabla que ya existe van SIN REFERENCES.
  `ALTER TABLE venta ADD COLUMN tipo_comprobante TEXT NOT NULL DEFAULT 'nota_venta' CHECK (tipo_comprobante IN ('nota_venta','boleta','factura'));`,
  `ALTER TABLE venta ADD COLUMN serie TEXT;`,
  `ALTER TABLE venta ADD COLUMN numero_comprobante INTEGER;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_venta_comprobante ON venta(serie, numero_comprobante)
     WHERE serie IS NOT NULL AND numero_comprobante IS NOT NULL;`,
  // 0035 y 0036: series de comprobantes (cada una con su correlativo; el largo del número queda en la serie).
  `CREATE TABLE IF NOT EXISTS serie_comprobante (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo                TEXT NOT NULL CHECK (tipo IN ('boleta','factura')),
      serie               TEXT NOT NULL,
      digitos_numero      INTEGER NOT NULL DEFAULT 7 CHECK (digitos_numero IN (7,8)),
      siguiente_numero    INTEGER NOT NULL DEFAULT 1 CHECK (siguiente_numero >= 1),
      activo              INTEGER NOT NULL DEFAULT 1,
      es_predeterminada   INTEGER NOT NULL DEFAULT 0,
      creado_en           TEXT NOT NULL DEFAULT (datetime('now')),
      actualizado_en      TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_serie_comprobante_serie ON serie_comprobante(serie COLLATE NOCASE);`,
  // 0037: serie que cada usuario usa por defecto, una por tipo (la asigna un administrador).
  `CREATE TABLE IF NOT EXISTS usuario_serie (
      usuario_id  INTEGER NOT NULL REFERENCES usuario(id),
      tipo        TEXT NOT NULL CHECK (tipo IN ('boleta','factura')),
      serie_id    INTEGER NOT NULL REFERENCES serie_comprobante(id),
      PRIMARY KEY (usuario_id, tipo)
  );`,
  // 0038: las series ahora son solo 3 NÚMEROS (001). Las que se hayan creado con letras (B001, F001...) se
  // desactivan para siempre (no se pueden reactivar) y conservan sus números ya emitidos. Se vuelve a correr
  // en cada arranque: es seguro porque esas series ya no se pueden activar.
  `UPDATE serie_comprobante SET activo = 0, es_predeterminada = 0 WHERE serie NOT GLOB '[0-9][0-9][0-9]' AND (activo = 1 OR es_predeterminada = 1);`,
  // 0039: cuándo se le envió por última vez el recordatorio de cobro por WhatsApp (Fiados). NULL = nunca.
  // Columna nueva de una tabla que ya existe: SIN REFERENCES.
  `ALTER TABLE cliente ADD COLUMN ultimo_recordatorio_en TEXT;`,
  // 0040: fecha en que el cliente se comprometió a pagar su deuda ('YYYY-MM-DD'). NULL = sin compromiso.
  // Se borra sola cuando el cliente queda sin deuda. Columna nueva de una tabla existente: SIN REFERENCES.
  `ALTER TABLE cliente ADD COLUMN fecha_compromiso TEXT;`,
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
