export function Proximamente({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <section className="mt-6 rounded-xl border border-linea p-5 text-center">
      <p className="text-sm font-semibold text-tinta">🚧 {titulo}</p>
      <p className="mt-2 text-xs text-tinta/60">{detalle}</p>
    </section>
  );
}
