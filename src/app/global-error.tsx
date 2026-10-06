'use client';

/** Último recurso: errores que ocurren en el layout raíz. */
export default function ErrorGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body style={{ fontFamily: 'sans-serif', padding: 24, textAlign: 'center' }}>
        <h1 style={{ fontSize: 18 }}>Vende Fácil tuvo un problema</h1>
        <p style={{ fontSize: 13, opacity: 0.7 }}>Tus datos están a salvo.</p>
        <pre style={{ fontSize: 12, textAlign: 'left', overflow: 'auto', background: '#0001', padding: 12 }}>
          {error?.name}: {error?.message}
        </pre>
        <button onClick={() => reset()} style={{ padding: '8px 16px' }}>
          Reintentar
        </button>
      </body>
    </html>
  );
}
