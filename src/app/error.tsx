"use client";

export default function ApplicationError({ reset }: { reset: () => void }) {
  return <main id="contenido" tabIndex={-1} className="page-container flex-1 py-10">
    <div role="alert" className="rounded-xl border border-destructive bg-card p-6">
      <h1 className="text-2xl font-semibold">No pudimos cargar esta página</h1>
      <p className="mt-3">El servicio puede no estar disponible o faltar una migración. No reemplazamos los datos de PostgreSQL con ejemplos.</p>
      <button onClick={reset} className="text-link mt-4 min-h-11">Reintentar</button>
    </div>
  </main>;
}
