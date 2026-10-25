import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { ContributionForm } from "@/components/contributions/contribution-form";
import type { SearchParameters } from "@/lib/catalog/filters";
import ContributionLoading from "./loading";
import { requireAccount } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Aportar material · Wiki ICM", robots: { index: false, follow: false } };

export default function ContributionPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  return <Suspense fallback={<ContributionLoading />}><ContributionContent searchParams={searchParams} /></Suspense>;
}

async function ContributionContent({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  await requireAccount("/aportar");
  const query = await searchParams;
  return <main id="contenido" tabIndex={-1} className="page-container flex-1 pt-6 pb-12 sm:pt-8 sm:pb-16">
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Aportar material" }]} />
      <header className="mb-8">
        <Badge>Aporte real · revisión humana</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Comparte lo que te ayudó a aprender</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">Completa los datos y revisa el archivo en tu dispositivo antes de enviarlo. Tu aporte permanecerá privado hasta que una persona moderadora lo apruebe.</p>
        <p className="mt-4 rounded-xl border border-border bg-secondary p-4 text-sm text-secondary-foreground">El catálogo puede contener ramos ilustrativos: no representa necesariamente la malla oficial. Comparte solo materiales autorizados y sin datos personales que no deban divulgarse.</p>
      </header>
      <ContributionForm real key={typeof query.ramo === "string" ? query.ramo : "sin-ramo-unico"} courseSlug={typeof query.ramo === "string" ? query.ramo : undefined} invalidCourseLink={query.ramo !== undefined && typeof query.ramo !== "string"} />
    </div>
  </main>;
}
