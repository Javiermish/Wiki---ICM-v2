"use client";

import { useFormStatus } from "react-dom";
import { logoutAction } from "@/lib/auth/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted disabled:opacity-60">{pending ? "Cerrando sesión…" : "Cerrar sesión"}</button>;
}

export function LogoutButton() {
  return <form action={logoutAction}><Submit /></form>;
}
