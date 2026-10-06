'use client';

import { useEffect } from 'react';

/**
 * Pantalla de error de ruta: en vez del genérico "Application error",
 * muestra el mensaje real del fallo y permite reintentar sin cerrar la app.
 */
export default function ErrorDePantalla({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Vende Fácil — error de pantalla:', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-semibold">Algo salió mal en esta pantalla</h1>
      <p className="text-sm opacity-70">Tus datos están a salvo. Puedes reintentar o volver al inicio.</p>
      <pre className="w-full overflow-auto rounded bg-black/5 p-3 text-left text-xs">
        {error?.name}: {error?.message}
      </pre>
      <div className="flex gap-3">
        <button className="rounded bg-black/80 px-4 py-2 text-sm text-white" onClick={() => reset()}>
          Reintentar
        </button>
        <button
          className="rounded border px-4 py-2 text-sm"
          onClick={() => {
            window.location.href = '/';
          }}
        >
          Ir al inicio
        </button>
      </div>
    </main>
  );
}
