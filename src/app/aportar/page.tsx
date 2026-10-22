import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { ContributionForm } from "@/components/contributions/contribution-form";
import { demoCatalog } from "@/fixtures/catalog";
import type { SearchParameters } from "@/lib/catalog/filters";
import ContributionLoading from "./loading";

export const metadata: Metadata = { title: "Aportar material · Wiki ICM" };

export default function ContributionPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  return <Suspense fallback={<ContributionLoading />}><ContributionContent searchParams={searchParams} /></Suspense>;
}

async function ContributionContent({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  const query = await searchParams;
  const course = typeof query.ramo === "string" ? demoCatalog.courses.find((entry) => entry.slug === query.ramo) : undefined;
  const invalidCourseLink = query.ramo !== undefined && !course;
  return <main id="contenido" tabIndex={-1} className="page-container flex-1 pt-6 pb-12 sm:pt-8 sm:pb-16">
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Aportar material" }]} />
      <header className="mb-8">
        <Badge>Demostración local · sin envíos</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Comparte lo que te ayudó a aprender</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">Prueba cómo será aportar un material. Completa sus datos y previsualiza un archivo en tu dispositivo, sin iniciar sesión ni enviarlo a ningún servidor.</p>
        <p className="mt-4 rounded-xl border border-border bg-secondary p-4 text-sm text-secondary-foreground">Los ramos son ficticios y no representan la malla oficial. Nada se guarda ni publica: tus datos y el archivo solo permanecen en memoria durante esta visita.</p>
      </header>
      <ContributionForm courses={demoCatalog.courses} initialCourseId={course?.id} invalidCourseLink={invalidCourseLink} />
    </div>
  </main>;
}
