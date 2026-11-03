/**
 * Esqueletos de carga: barras grises que laten suavemente mientras llegan los datos, para no
 * mostrar una pantalla vacía ni un «Cargando…» suelto. Con «reducir movimiento» no se animan.
 */
export function Esqueleto({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-linea motion-reduce:animate-none ${className}`} />;
}

/** Lista de filas de esqueleto (nombre a la izquierda, importe a la derecha), con el mismo aspecto que las listas reales. */
export function EsqueletoLista({ filas = 5 }: { filas?: number }) {
  return (
    <div role="status" aria-label="Cargando" className="divide-y divide-linea border-y border-linea">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-4">
          <div className="flex-1 space-y-2">
            <Esqueleto className={`h-4 ${i % 2 === 0 ? 'w-2/3' : 'w-1/2'}`} />
            <Esqueleto className="h-3 w-1/3" />
          </div>
          <Esqueleto className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
