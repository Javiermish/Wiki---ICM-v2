import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ModeratorRoleForm } from "@/components/auth/auth-form";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import Link from "next/link";

export const metadata: Metadata = { title: "Administrar usuarios · Wiki ICM", robots: { index: false, follow: false } };

type UserRow = { user_id: string; email: string; display_name: string | null; role: "student" | "moderator" | "admin"; email_confirmed_at: string | null };
type RoleEvent = { id: string; target_user_id: string; actor_id: string; old_role: string; new_role: string; reason: string; created_at: string };
const cell = "px-4 py-3 text-left align-top";

type Params = { page?: string; historyPage?: string };
export default function UsersPage(props: { searchParams: Promise<Params> }) {
  return <Suspense fallback={<main id="contenido" tabIndex={-1} className="page-container flex-1 py-10"><p role="status">Verificando permisos…</p></main>}><UsersContent {...props} /></Suspense>;
}

async function UsersContent({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole(["admin"], "/admin/usuarios");
  const params = await searchParams;
  const pageNumber = (value: unknown) => typeof value === "string" && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : 1;
  const page = pageNumber(params.page);
  const historyPage = pageNumber(params.historyPage);
  const client = await createClient();
  const [usersResult, eventsResult] = await Promise.all([
    client.rpc("list_account_users", { page_size: 50, page_offset: (page - 1) * 50 }),
    client.from("role_change_events").select("id,target_user_id,actor_id,old_role,new_role,reason,created_at").order("created_at", { ascending: false }).order("id").range((historyPage - 1) * 50, historyPage * 50 - 1),
  ]);
  const users = ((usersResult.data ?? []) as UserRow[]).map((user) => ({ ...user, id: user.user_id }));
  const events = (eventsResult.data ?? []) as RoleEvent[];
  return <main id="contenido" tabIndex={-1} className="page-container min-w-0 flex-1 space-y-8 py-6 sm:py-10">
    <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Mi cuenta", href: "/mi-cuenta" }, { label: "Administrar usuarios" }]} />
    <header className="max-w-3xl"><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Administrar usuarios</h1><p className="mt-3 text-muted-foreground">Cambios reales de permisos, verificados y auditados en servidor. Solo se concede o revoca el rol de moderador; las cuentas administradoras no se pueden modificar desde esta aplicación.</p></header>
    <section aria-labelledby="users-title" className="min-w-0 space-y-4">
      <h2 id="users-title" className="text-xl font-semibold">Cuentas</h2>
      {usersResult.error ? <p role="alert" className="text-destructive">No se pudieron cargar las cuentas. Recarga la página para reintentar; no se muestran datos de demostración.</p> : users.length === 0 ? <p className="text-muted-foreground">No hay cuentas disponibles.</p> : <div role="region" aria-label="Tabla de cuentas, desplazable horizontalmente" tabIndex={0} className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm"><caption className="sr-only">Cuentas y cambios de moderación</caption><thead><tr className="border-b border-border"><th scope="col" className={cell}>Cuenta</th><th scope="col" className={cell}>Rol actual</th><th scope="col" className={cell}>Permisos</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-b border-border last:border-0"><td className={`${cell} break-all`}><p className="font-medium">{user.display_name || "Sin nombre"}</p><p>{user.email}</p><p className="mt-1 text-xs text-muted-foreground">{user.id}</p></td><td className={cell}>{user.role === "admin" ? "Administrador" : user.role === "moderator" ? "Moderador" : "Estudiante"}</td><td className={cell}>{user.role === "admin" ? <span className="text-muted-foreground">Rol protegido, no editable</span> : <ModeratorRoleForm targetUserId={user.id} enabled={user.role !== "moderator"} />}</td></tr>)}</tbody></table>
      </div>}
      <nav aria-label="Páginas de cuentas" className="flex flex-wrap items-center gap-4 text-sm">
        {page > 1 && <Link className="min-h-11 content-center underline" href={`?page=${page - 1}&historyPage=${historyPage}`}>Cuentas anteriores</Link>}
        <span>Página {page}</span>
        {users.length === 50 && <Link className="min-h-11 content-center underline" href={`?page=${page + 1}&historyPage=${historyPage}`}>Más cuentas</Link>}
      </nav>
    </section>
    <section aria-labelledby="events-title" className="min-w-0 space-y-4">
      <h2 id="events-title" className="text-xl font-semibold">Historial de cambios de rol</h2>
      {eventsResult.error ? <p role="alert" className="text-destructive">No se pudo cargar el historial de cambios. Recarga la página para reintentar.</p> : events.length === 0 ? <p className="text-muted-foreground">No hay cambios registrados.</p> : <div role="region" aria-label="Historial de roles, desplazable horizontalmente" tabIndex={0} className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm"><caption className="sr-only">Historial real de cambios de rol</caption><thead><tr className="border-b border-border">{["Fecha", "Cuenta afectada", "Responsable", "Cambio", "Motivo"].map((label) => <th key={label} scope="col" className={cell}>{label}</th>)}</tr></thead><tbody>{events.map((event) => <tr key={event.id} className="border-b border-border last:border-0"><td className={cell}><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString("es-CL", { timeZone: "UTC" })} UTC</time></td><td className={`${cell} break-all`}>{event.target_user_id}</td><td className={`${cell} break-all`}>{event.actor_id}</td><td className={cell}>{event.old_role} → {event.new_role}</td><td className={`${cell} min-w-48 whitespace-pre-wrap break-words`}>{event.reason}</td></tr>)}</tbody></table>
      </div>}
      <nav aria-label="Páginas del historial" className="flex flex-wrap items-center gap-4 text-sm">
        {historyPage > 1 && <Link className="min-h-11 content-center underline" href={`?page=${page}&historyPage=${historyPage - 1}`}>Cambios anteriores</Link>}
        <span>Página {historyPage} · 50 por página</span>
        {events.length === 50 && <Link className="min-h-11 content-center underline" href={`?page=${page}&historyPage=${historyPage + 1}`}>Más cambios</Link>}
      </nav>
    </section>
  </main>;
}
