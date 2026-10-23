import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isRole, safeNext, type Account, type Role } from "@/domain/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type AccountResult =
  | { status: "authenticated"; account: Account }
  | { status: "unauthenticated" | "unverified" | "configuration_error" | "profile_error" | "unavailable" };

export async function getAccountResult(): Promise<AccountResult> {
  if (!isSupabaseConfigured()) return { status: "configuration_error" };
  // Auth reads the clock internally; let Next suspend outside the SDK error handler.
  await connection();
  try {
    const client = await createClient();
    const { data, error } = await client.auth.getClaims();
    if (error || !data?.claims.sub) return { status: "unauthenticated" };
    // Confirmation and role are current DB/Auth values, not user-editable metadata.
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) return { status: "unavailable" };
    if (!userData.user || userData.user.id !== data.claims.sub) return { status: "unauthenticated" };
    if (!userData.user.email_confirmed_at) return { status: "unverified" };
    const [profileResult, roleResult] = await Promise.all([
      client.from("profiles").select("display_name").eq("id", data.claims.sub).single(),
      client.from("user_roles").select("role").eq("user_id", data.claims.sub).single(),
    ]);
    const profile = profileResult.data;
    const role = roleResult.data;
    // Missing tables, rows or grants are provisioning failures, never email failures.
    if (profileResult.error || roleResult.error || typeof profile?.display_name !== "string" || !isRole(role?.role)) return { status: "profile_error" };
    return { status: "authenticated", account: { id: data.claims.sub, email: userData.user.email ?? "", displayName: profile.display_name, role: role.role } };
  } catch { return { status: "unavailable" }; }
}

export async function getAccount(): Promise<Account | null> {
  const result = await getAccountResult();
  return result.status === "authenticated" ? result.account : null;
}

export async function requireAccount(next = "/mi-cuenta"): Promise<Account> {
  const result = await getAccountResult();
  if (result.status === "authenticated") return result.account;
  const error = result.status === "profile_error" ? "&error=profile" : result.status === "configuration_error" ? "&error=configuration" : result.status === "unavailable" ? "&error=session" : result.status === "unverified" ? "&error=unverified" : "";
  redirect(`/login?next=${encodeURIComponent(safeNext(next))}${error}`);
}

export async function requireRole(roles: Role[], next = "/mi-cuenta"): Promise<Account> {
  const account = await requireAccount(next);
  if (!roles.includes(account.role)) redirect("/mi-cuenta?error=forbidden");
  return account;
}
