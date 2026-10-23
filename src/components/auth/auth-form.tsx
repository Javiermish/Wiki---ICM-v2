"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import type { InputHTMLAttributes } from "react";
import type { AuthActionState } from "@/domain/auth";
import { loginAction, registerAction, recoverPasswordAction, updatePasswordAction, updateProfileAction, setModeratorAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

const actions = { login: loginAction, register: registerAction, recover: recoverPasswordAction, password: updatePasswordAction, profile: updateProfileAction };
const labels = { login: "Iniciar sesión", register: "Crear cuenta", recover: "Enviar enlace de recuperación", password: "Actualizar contraseña", profile: "Guardar nombre" };

function Feedback({ state }: { state: AuthActionState }) {
  const ref = useRef<HTMLDivElement>(null);
  const hasError = Boolean(state.error || Object.keys(state.fieldErrors ?? {}).length);
  useEffect(() => { if (hasError) ref.current?.focus(); }, [state, hasError]);
  return <>
    {hasError && <div ref={ref} tabIndex={-1} role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">
      <p>{state.error ?? "Revisa los campos indicados."}</p>
      {state.fieldErrors && <ul className="list-inside list-disc">{Object.entries(state.fieldErrors).map(([field, error]) => <li key={field}>{error}</li>)}</ul>}
    </div>}
    {state.success && <p role="status" className="rounded-lg bg-secondary p-3 text-sm text-secondary-foreground">{state.success}</p>}
  </>;
}

function Field({ label, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = useId();
  return <div className="space-y-2">
    <label htmlFor={id} className="block text-sm font-medium">{label}</label>
    <input {...props} id={id} className="field" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />
    {error && <p id={`${id}-error`} className="text-sm text-destructive">{error}</p>}
  </div>;
}

export function AuthForm({ mode, next = "/mi-cuenta", displayName = "" }: { mode: keyof typeof actions; next?: string; displayName?: string }) {
  const [state, action, pending] = useActionState<AuthActionState, FormData>(actions[mode], {});
  const needsPassword = mode === "login" || mode === "register" || mode === "password";
  const confirmPassword = mode === "register" || mode === "password";
  return <form action={action} aria-busy={pending} className="space-y-4">
    <Feedback state={state} />
    {mode === "login" && <input type="hidden" name="next" value={next} />}
    <fieldset disabled={pending} className="min-w-0 space-y-4">
      <legend className="sr-only">{labels[mode]}</legend>
      {(mode === "login" || mode === "register" || mode === "recover") && <Field label="Correo electrónico" name="email" type="email" autoComplete="email" required maxLength={254} error={state.fieldErrors?.email} />}
      {mode === "profile" && <Field label="Nombre visible" name="displayName" autoComplete="nickname" maxLength={80} defaultValue={displayName} error={state.fieldErrors?.displayName} />}
      {needsPassword && <>
        <Field label={mode === "password" ? "Nueva contraseña" : "Contraseña"} name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? 1 : 12} maxLength={128} error={state.fieldErrors?.password} />
        {mode !== "login" && <p className="text-sm text-muted-foreground">Entre 12 y 128 caracteres.</p>}
      </>}
      {confirmPassword && <Field label="Confirmar contraseña" name="passwordConfirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} error={state.fieldErrors?.passwordConfirm} />}
      <Button type="submit" disabled={pending} className="min-h-11 w-full whitespace-normal">{pending ? "Procesando…" : labels[mode]}</Button>
    </fieldset>
  </form>;
}

export function ModeratorRoleForm({ targetUserId, enabled }: { targetUserId: string; enabled: boolean }) {
  const [state, action, pending] = useActionState<AuthActionState, FormData>(setModeratorAction, {});
  const id = useId();
  return <form action={action} aria-busy={pending} className="min-w-64 space-y-3">
    <Feedback state={state} />
    <input type="hidden" name="targetUserId" value={targetUserId} />
    <input type="hidden" name="enabled" value={String(enabled)} />
    <fieldset disabled={pending} className="space-y-2">
      <legend className="sr-only">{enabled ? "Conceder" : "Revocar"} moderación</legend>
      <label htmlFor={id} className="block text-sm font-medium">Motivo del cambio (5–500 caracteres)</label>
      <textarea id={id} name="reason" required minLength={5} maxLength={500} rows={2} className="field" aria-invalid={state.fieldErrors?.reason ? true : undefined} aria-describedby={state.fieldErrors?.reason ? `${id}-error` : undefined} />
      {state.fieldErrors?.reason && <p id={`${id}-error`} className="text-sm text-destructive">{state.fieldErrors.reason}</p>}
      <Button type="submit" variant="outline" disabled={pending} className="min-h-11">{pending ? "Actualizando…" : enabled ? "Conceder moderación" : "Revocar moderación"}</Button>
    </fieldset>
  </form>;
}
