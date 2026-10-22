import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LocalCourseSearch({ semester, query }: { semester: number; query?: string }) {
  return (
    <form action={`/semestres/${semester}`} method="get" role="search" aria-label="Buscar ramos de este semestre" className="mb-8 max-w-2xl">
      <label htmlFor="course-query" className="mb-2 block text-sm font-semibold">Busca un ramo en este semestre</label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-3.5 left-4 size-5 text-muted-foreground" aria-hidden="true" />
          <input key={query ?? ""} id="course-query" name="q" type="search" defaultValue={query} maxLength={200} placeholder="Nombre o código del ramo" aria-describedby="course-search-hint" className="field min-h-12 pl-12" />
        </div>
        <Button type="submit" className="min-h-12 px-6">Buscar</Button>
      </div>
      <p id="course-search-hint" className="mt-2 text-sm text-muted-foreground">Busca por nombre o código de ejemplo, con o sin tildes.</p>
    </form>
  );
}
