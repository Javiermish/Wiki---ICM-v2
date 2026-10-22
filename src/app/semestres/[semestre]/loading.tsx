export default function SemesterLoading() {
  return (
    <main id="contenido" tabIndex={-1} aria-busy="true" className="page-container flex-1 pt-6 pb-12 sm:pt-8 sm:pb-16">
      <h1 className="text-3xl font-semibold tracking-tight">Semestre curricular</h1>
      <p role="status" className="mt-4 text-muted-foreground">Cargando ramos de ejemplo…</p>
      <div aria-hidden="true" className="mt-8 grid gap-4 md:grid-cols-2">{[1, 2, 3, 4].map((item) => <div key={item} className="h-48 rounded-xl border border-border bg-card" />)}</div>
    </main>
  );
}
