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
