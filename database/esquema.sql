-- ============================================================
-- Vende Fácil — Esquema de base de datos local (SQLite)
-- ------------------------------------------------------------
-- Convención: todas las tablas, columnas y relaciones están
-- nombradas en español para mantener consistencia en todo
-- el proyecto (código, documentación y base de datos).
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- 1. Catálogo: categorías y productos
-- ------------------------------------------------------------

CREATE TABLE categoria (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre          TEXT NOT NULL UNIQUE,
    activo          INTEGER NOT NULL DEFAULT 1,       -- 1 = activa, 0 = inactiva
    creado_en       TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE producto (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre          TEXT NOT NULL,
    categoria_id    INTEGER REFERENCES categoria(id) ON DELETE SET NULL,
    codigo          TEXT,                             -- código de barras u otro, opcional
    precio_venta    REAL NOT NULL CHECK (precio_venta >= 0),
    costo           REAL NOT NULL CHECK (costo >= 0),
    stock_actual    REAL NOT NULL DEFAULT 0,
    stock_minimo    REAL NOT NULL DEFAULT 0,
    unidad_medida   TEXT NOT NULL DEFAULT 'unidad',   -- unidad, kg, litro, paquete, etc.
    activo          INTEGER NOT NULL DEFAULT 1,       -- eliminación lógica
    creado_en       TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_producto_categoria ON producto(categoria_id);
CREATE INDEX idx_producto_codigo    ON producto(codigo);
CREATE INDEX idx_producto_activo    ON producto(activo);

-- ------------------------------------------------------------
-- 2. Clientes y fiados
-- ------------------------------------------------------------

CREATE TABLE cliente (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre              TEXT NOT NULL,
    documento           TEXT,                          -- DNI/CE, 15 caracteres alfanuméricos
    telefono            TEXT,
    direccion           TEXT,
    saldo_pendiente     REAL NOT NULL DEFAULT 0,      -- total adeudado, se recalcula
    fecha_ultimo_pago   TEXT,
    activo              INTEGER NOT NULL DEFAULT 1,
    creado_en           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Único cuando hay documento; permite convivir con clientes antiguos
-- sin documento (creados antes de este campo) sin romper nada.
CREATE UNIQUE INDEX idx_cliente_documento ON cliente(documento) WHERE documento IS NOT NULL;

-- ------------------------------------------------------------
-- 3. Ventas
-- ------------------------------------------------------------

CREATE TABLE venta (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha_hora          TEXT NOT NULL DEFAULT (datetime('now')),
    cliente_id          INTEGER REFERENCES cliente(id) ON DELETE SET NULL,
    metodo_pago         TEXT NOT NULL CHECK (metodo_pago IN ('efectivo','yape','plin','tarjeta','fiado')),
    subtotal            REAL NOT NULL CHECK (subtotal >= 0),
    total               REAL NOT NULL CHECK (total >= 0),
    ganancia_estimada   REAL NOT NULL DEFAULT 0,
    anulada             INTEGER NOT NULL DEFAULT 0,   -- trazabilidad: no se borra, se anula
    motivo_anulacion    TEXT,
    creado_en           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_venta_fecha    ON venta(fecha_hora);
CREATE INDEX idx_venta_cliente  ON venta(cliente_id);
CREATE INDEX idx_venta_anulada  ON venta(anulada);

CREATE TABLE detalle_venta (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id            INTEGER NOT NULL REFERENCES venta(id) ON DELETE CASCADE,
    producto_id         INTEGER NOT NULL REFERENCES producto(id) ON DELETE RESTRICT,
    cantidad            REAL NOT NULL CHECK (cantidad > 0),
    precio_unitario     REAL NOT NULL CHECK (precio_unitario >= 0),  -- precio al momento de la venta
    costo_unitario      REAL NOT NULL CHECK (costo_unitario >= 0),   -- costo al momento de la venta
    subtotal            REAL NOT NULL,                               -- precio_unitario * cantidad
    ganancia_linea      REAL NOT NULL                                -- (precio_unitario - costo_unitario) * cantidad
);

CREATE INDEX idx_detalle_venta_venta     ON detalle_venta(venta_id);
CREATE INDEX idx_detalle_venta_producto  ON detalle_venta(producto_id);

CREATE TABLE deuda_cliente (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id          INTEGER NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
    venta_id            INTEGER REFERENCES venta(id) ON DELETE SET NULL,  -- origen del fiado, si aplica
    monto               REAL NOT NULL CHECK (monto > 0),
    saldo_pendiente     REAL NOT NULL,
    estado              TEXT NOT NULL DEFAULT 'pendiente'
                            CHECK (estado IN ('pendiente','pagada_parcial','pagada')),
    fecha               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_deuda_cliente_cliente ON deuda_cliente(cliente_id);
CREATE INDEX idx_deuda_cliente_estado  ON deuda_cliente(estado);

CREATE TABLE pago_deuda (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id          INTEGER NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
    deuda_id            INTEGER REFERENCES deuda_cliente(id) ON DELETE SET NULL,
    monto               REAL NOT NULL CHECK (monto > 0),
    metodo_pago         TEXT NOT NULL CHECK (metodo_pago IN ('efectivo','yape','plin','tarjeta')),
    nota                TEXT,
    fecha               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_pago_deuda_cliente ON pago_deuda(cliente_id);

-- ------------------------------------------------------------
-- 4. Caja
-- ------------------------------------------------------------

CREATE TABLE movimiento_caja (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo                TEXT NOT NULL CHECK (tipo IN ('ingreso','egreso')),
    monto               REAL NOT NULL CHECK (monto > 0),
    concepto            TEXT NOT NULL,                 -- ej: "Venta #123", "Retiro", "Pago a proveedor"
    metodo_pago         TEXT CHECK (metodo_pago IN ('efectivo','yape','plin','tarjeta')),
    venta_id            INTEGER REFERENCES venta(id) ON DELETE SET NULL,
    saldo_resultante    REAL NOT NULL,                 -- saldo de caja después de este movimiento
    fecha_hora          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_movimiento_caja_fecha ON movimiento_caja(fecha_hora);
CREATE INDEX idx_movimiento_caja_tipo  ON movimiento_caja(tipo);

-- ------------------------------------------------------------
-- 5. Compras y proveedores
-- ------------------------------------------------------------

CREATE TABLE proveedor (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT NOT NULL,
    ruc         TEXT,                  -- opcional, hasta 15 caracteres alfanuméricos
    contacto    TEXT,
    telefono    TEXT,                  -- celular u otro teléfono, opcional, entre 6 y 12 dígitos
    direccion   TEXT,
    activo      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE compra (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    proveedor_id                INTEGER REFERENCES proveedor(id) ON DELETE SET NULL,
    proveedor_nombre_libre      TEXT,      -- proveedor "al vuelo", sin guardar como registro
    comprobante                 TEXT,      -- serie-número libre, ej: F001-00000010 (hasta 15 caracteres)
    fecha                       TEXT NOT NULL DEFAULT (datetime('now')),
    total                       REAL NOT NULL CHECK (total >= 0),
    estado                      TEXT NOT NULL DEFAULT 'recibida'
                                    CHECK (estado IN ('pendiente','recibida','anulada')),
    nota                        TEXT
);

CREATE INDEX idx_compra_proveedor ON compra(proveedor_id);

CREATE TABLE detalle_compra (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    compra_id           INTEGER NOT NULL REFERENCES compra(id) ON DELETE CASCADE,
    producto_id         INTEGER NOT NULL REFERENCES producto(id) ON DELETE RESTRICT,
    cantidad            REAL NOT NULL CHECK (cantidad > 0),
    costo_unitario      REAL NOT NULL CHECK (costo_unitario >= 0),
    subtotal            REAL NOT NULL
);

CREATE INDEX idx_detalle_compra_compra ON detalle_compra(compra_id);

-- ------------------------------------------------------------
-- 6. Inventario
-- ------------------------------------------------------------

CREATE TABLE movimiento_inventario (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id         INTEGER NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
    tipo                TEXT NOT NULL CHECK (tipo IN ('entrada','salida','ajuste')),
    cantidad            REAL NOT NULL,
    motivo              TEXT NOT NULL,                 -- 'venta', 'compra', 'ajuste_manual', 'merma', etc.
    venta_id            INTEGER REFERENCES venta(id) ON DELETE SET NULL,
    compra_id           INTEGER REFERENCES compra(id) ON DELETE SET NULL,
    stock_resultante    REAL NOT NULL,
    fecha_hora          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_movimiento_inventario_producto ON movimiento_inventario(producto_id);

-- ------------------------------------------------------------
-- 7. Configuración y respaldo
-- ------------------------------------------------------------

CREATE TABLE configuracion_app (
    clave       TEXT PRIMARY KEY,
    valor       TEXT NOT NULL
);

CREATE TABLE metadato_respaldo (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha_hora      TEXT NOT NULL DEFAULT (datetime('now')),
    tipo            TEXT NOT NULL CHECK (tipo IN ('manual','automatico')),
    ruta_archivo    TEXT,
    tamano_bytes    INTEGER,
    estado          TEXT NOT NULL DEFAULT 'completado'
                        CHECK (estado IN ('completado','fallido'))
);
