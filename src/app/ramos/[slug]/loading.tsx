export default function CourseLoading() {
  return (
    <main id="contenido" tabIndex={-1} aria-busy="true" className="page-container flex-1 pt-6 pb-12 sm:pt-8 sm:pb-16">
      <h1 className="text-3xl font-semibold tracking-tight">Ramo de ejemplo</h1>
      <p role="status" className="mt-4 text-muted-foreground">Cargando materiales aprobados ficticios…</p>
      <div aria-hidden="true" className="mt-8 space-y-4">{[1, 2, 3].map((item) => <div key={item} className="h-40 rounded-xl border border-border bg-card" />)}</div>
    </main>
  );
}
