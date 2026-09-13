# Bodega Fácil

Proyecto base de **Bodega Fácil**: app offline-first para bodegueros,
según el documento maestro del proyecto.

## Contenido

```text
bodega-facil/
├── database/
│   └── esquema.sql                        # Esquema SQLite, en español — fuente única de verdad
├── scripts/
│   ├── generar-esquema-ts.mjs              # Sincroniza esquema.sql -> código embebido
│   ├── copiar-sql-wasm.mjs                 # Copia el motor sql.js a /public
│   └── probar-flujo-venta.ts               # Prueba end-to-end de la capa de datos (sin navegador)
├── public/
│   ├── manifest.json / sw.js / icon.svg    # PWA
│   └── sql-wasm.wasm                       # generado por postinstall
├── src/
│   ├── app/
│   │   ├── page.tsx                        # Inicio: resumen del día (datos reales)
│   │   ├── ventas/nueva/page.tsx           # Flujo completo: armar carrito -> revisar -> cobrar
│   │   ├── productos/page.tsx              # Listado + alta de productos
│   │   ├── fiados/page.tsx                 # Clientes con deuda + registrar pago
│   │   ├── caja/page.tsx                   # Saldo, movimientos de hoy, ingreso/egreso manual
│   │   ├── compras/page.tsx                # Reponer stock desde un proveedor
│   │   └── mas/page.tsx                    # Menú hacia el resto de secciones
│   ├── components/registrar-service-worker.tsx
│   ├── core/                               # Independiente de la UI y de SQLite
│   │   ├── tipos.ts                        # Interfaces del dominio (español)
│   │   ├── reglas-negocio.ts               # Funciones puras (ganancia, stock, deuda, caja)
│   │   ├── exportacion.ts                  # Funciones puras: datos -> CSV
│   │   └── repositorios.ts                 # Puertos (interfaces) que la UI consume
│   ├── hooks/usar-contenedor.ts            # Hook de React hacia los repositorios
│   └── infraestructura/
│       ├── sqlite/                          # Implementación concreta sobre sql.js
│       │   ├── base-datos.ts, motor.ts, mapeadores.ts, esquema-sql.generado.ts
│       │   ├── producto.repositorio.ts, cliente.repositorio.ts
│       │   ├── venta.repositorio.ts         # Orquesta stock + caja/deuda en una transacción
│       │   ├── caja.repositorio.ts          # Única fuente de verdad del saldo
│       │   ├── fiado.repositorio.ts         # Pagos de deuda (también generan ingreso de caja)
│       │   ├── proveedor.repositorio.ts, compra.repositorio.ts
│       │   └── contenedor.ts                # Composition root + respaldo/restaurar
│       ├── exportacion/descargas.ts         # Efecto de lado: dispara la descarga en el navegador
│       └── persistencia/almacen-indexeddb.ts
├── next.config.js / tailwind.config.ts / tsconfig.json / package.json
└── .gitignore
```

## Estado del proyecto

**El Plan Gratis está funcionalmente completo, de punta a punta.**
Validado con `tsc --noEmit`, `next build` (producción, 9 rutas) y una
prueba de integración real (`npx tsx scripts/probar-flujo-venta.ts`,
23 verificaciones) que ejercita todo el flujo contra SQLite real: venta
al contado, venta al fiado, pago de deuda, compra a proveedor,
insuficiencia de stock, y el formato de los CSV exportados.

### Paso 3 — Capa de datos (sql.js)

- **SQLite real en el navegador** vía `sql.js` (WASM), no una simulación
  con IndexedDB puro. `database/esquema.sql` sigue siendo la única
  fuente de verdad: `npm run sync:esquema` lo empaqueta como código
  (necesario porque el navegador no puede leer archivos del disco).
- **Nota sobre sql.js + webpack** (costó encontrarla, la dejo anotada):
  el paquete resuelve por defecto hacia `dist/sql-wasm-browser.js` en
  bundlers como el de Next.js, y ese build ubica el `.wasm` con
  `import.meta.url` — se rompe con el empaquetado de Next
  ("Aborted: both async and sync fetching of the wasm failed"). Se
  fuerza el import a `sql.js/dist/sql-wasm.js` (`motor.ts`), que sí
  respeta `locateFile`. Ese build a su vez referencia
  `require("node:fs")`/`require("node:crypto")` en su rama de Node
  (nunca se ejecuta en el navegador, pero webpack igual la intenta
  empaquetar), así que `next.config.js` normaliza el esquema `node:` y
  los marca como no disponibles para el bundle del cliente.
- **Persistencia**: tras cada escritura, la base se serializa y se
  guarda en IndexedDB (`contenedor.persistir()`). Así sobrevive a
  cerrar la app — principio offline-first del documento maestro.
- **Arquitectura en puertos**: `src/core/repositorios.ts` define las
  interfaces; `src/infraestructura/sqlite/*` las implementa. La UI y
  las reglas de negocio no conocen SQLite directamente, tal como pide
  la sección 5. Cambiar a otro motor (ej. el plugin nativo de
  Capacitor) no debería tocar la UI.
- **Caja como dominio propio**: tanto una venta al contado como el
  pago de una deuda generan un ingreso de caja, así que esa lógica
  vive una sola vez en `CajaRepositorioSqlite` y la reutilizan
  `VentaRepositorioSqlite` y `FiadoRepositorioSqlite`.

### Paso 4-7 — Flujo vertical + módulos principales

- **Nueva venta** (`/ventas/nueva`): buscar producto, armar carrito,
  elegir método de pago (con selector/alta rápida de cliente si es
  fiado), pantalla de confirmación tipo boleta, guardar. Actualiza
  stock, caja y deuda en una sola transacción.
- **Inicio** (`/`): resumen del día con datos reales (ya no de ejemplo).
- **Productos** (`/productos`): listado con alerta de stock bajo + alta.
- **Fiados** (`/fiados`): clientes con deuda + registrar pago.
- **Caja** (`/caja`): saldo, movimientos de hoy, ingreso/egreso manual.
- **Compras** (`/compras`): reponer stock de un producto existente desde
  un proveedor (opcional). Actualiza stock, actualiza el costo del
  producto para que la ganancia de ventas futuras sea correcta, y
  descuenta de caja (se asume pagada al recibir, sin cuentas por pagar
  pendientes — así se mantiene simple para el Plan Gratis).
- **Respaldo y exportación** (`/mas/respaldo`): exportar ventas,
  productos y fiados a CSV (abre bien en Excel, con BOM para acentos);
  descargar un respaldo completo (.sqlite) de toda la bodega; y
  restaurarlo (con confirmación explícita y validación del archivo
  antes de sobrescribir nada). Cierra la promesa de "tus datos son
  tuyos" (secciones 14-15 del documento maestro).
- **Más** (`/mas`): menú hacia Caja, Compras, Respaldo y placeholders.

### Pendiente para antes de publicar (no bloquea el desarrollo)

- Reemplazar `public/icon.svg` por íconos PNG reales (192×192, 512×512,
  maskable) para máxima compatibilidad con iOS/Android.
- Definir `apple-touch-icon` cuando exista el ícono PNG final.

## Convención de idioma

Toda la base de datos —tablas, columnas y relaciones— está en español,
según lo pedido:

- `producto`, `categoria`, `venta`, `detalle_venta`, `cliente`,
  `deuda_cliente`, `pago_deuda`, `movimiento_caja`, `proveedor`, `compra`,
  `detalle_compra`, `movimiento_inventario`, `configuracion_app`,
  `metadato_respaldo`.

Los tipos de TypeScript (`tipos.ts`) siguen la misma convención para que
código, documentación y base de datos hablen el mismo idioma.

## Reglas de negocio implementadas (sección 29 del documento maestro)

| Función | Fórmula |
|---|---|
| `calcularGananciaLinea` | (Precio de venta − Costo) × Cantidad |
| `calcularStockNuevo` | Stock anterior + Entradas − Salidas |
| `calcularDeudaNueva` | Deuda anterior + Nuevos fiados − Pagos |
| `calcularSaldoCaja` | Saldo anterior + Ingresos − Egresos |

También incluye:

- `construirDetalleVenta` / `construirVenta`: arman una venta completa
  (subtotal, total, ganancia estimada) a partir de productos y cantidades,
  validando stock antes de calcular.
- `verificarStockDisponible`: evita vender más de lo que hay.
- `determinarEstadoDeuda`: pendiente / pagada_parcial / pagada.
- `redondear`: evita errores de punto flotante en montos de dinero.

Todas las funciones son **puras**: no tocan SQLite ni la UI. Esto permite
reutilizarlas igual si la venta viene de un botón, de voz, o de una futura
integración (sección 5.1 del documento maestro).

## Siguiente paso

Con esto se cierra el **Plan Gratis funcional completo** (venta, stock,
caja, fiados, compras, exportación y respaldo). Los siguientes pasos
del roadmap son:

1. **Diferenciación Free/Pro** — reportes avanzados, alertas
   inteligentes, exportación a Excel/PDF (en vez de solo CSV),
   sugerencias de compra — todo construido *sobre* los datos que ya
   existen, no antes.
2. Pulido de UX y validación con bodegueros reales antes de invertir en
   partes más costosas (voz, impresión Bluetooth, sincronización nube).
