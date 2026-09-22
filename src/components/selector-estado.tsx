'use client';

/**
 * Vende Fácil — Filtro Activos / Inactivos / Todos
 * ------------------------------------------------------------
 * Combo compartido por Productos, Clientes y Proveedores. Por defecto
 * se muestran solo los activos (lo que se usa día a día); los
 * inactivos se ven eligiendo "Inactivos" o "Todos".
 */
export type FiltroEstado = 'activos' | 'inactivos' | 'todos';

export function filtrarPorEstado<T extends { activo: boolean }>(items: T[], filtro: FiltroEstado): T[] {
  if (filtro === 'todos') return items;
  return items.filter((item) => (filtro === 'activos' ? item.activo : !item.activo));
}

export function SelectorEstado({
  valor,
  onCambiar,
}: {
  valor: FiltroEstado;
  onCambiar: (nuevo: FiltroEstado) => void;
}) {
  return (
    <select
      value={valor}
      onChange={(e) => onCambiar(e.target.value as FiltroEstado)}
      aria-label="Filtrar por estado"
      className="h-11 shrink-0 rounded-xl border border-linea bg-white px-3 text-sm outline-none focus:border-bodega"
    >
      <option value="activos">Activos</option>
      <option value="inactivos">Inactivos</option>
      <option value="todos">Todos</option>
    </select>
  );
}
