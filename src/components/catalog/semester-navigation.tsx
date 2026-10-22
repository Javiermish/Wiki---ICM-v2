import Link from "next/link";

export function SemesterNavigation({ semesters, current }: { semesters: readonly number[]; current: number }) {
  return (
    <nav aria-label="Semestres curriculares de ejemplo" className="my-6">
      <ul className="flex flex-wrap gap-2">
        {semesters.map((semester) => (
          <li key={semester}><Link href={`/semestres/${semester}`} aria-current={current === semester ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold ${current === semester ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"}`}>Semestre {semester}</Link></li>
        ))}
      </ul>
    </nav>
  );
}
