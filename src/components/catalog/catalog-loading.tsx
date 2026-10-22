export function CatalogLoading() {
  return (
    <main id="contenido" tabIndex={-1} className="page-container flex-1 py-8" aria-busy="true">
      <div className="hero-panel min-h-80">
        <h1 className="text-3xl font-semibold">Wiki ICM</h1>
        <p role="status" className="mt-4">Cargando catálogo de ejemplo…</p>
      </div>
      <div aria-hidden="true" className="my-8 grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((item) => <div key={item} className="h-48 rounded-xl border border-border bg-card" />)}
      </div>
    </main>
  );
}
