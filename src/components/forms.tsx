"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/app/actions";
import { btnDanger, btnPrimary, btnSecondary, FormMessage, input, label } from "./ui";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

export function AuthForm({ action, mode, next }: { action: Action; mode: "login" | "signup"; next: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const q = next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {mode === "signup" && (
        <div>
          <label htmlFor="name" className={label}>Name</label>
          <input id="name" name="name" required className={input} autoComplete="name" />
        </div>
      )}
      <div>
        <label htmlFor="email" className={label}>Email</label>
        <input id="email" name="email" type="email" required className={input} autoComplete="email" />
      </div>
      <div>
        <label htmlFor="password" className={label}>Password</label>
        <input id="password" name="password" type="password" required minLength={8} className={input}
          autoComplete={mode === "signup" ? "new-password" : "current-password"} />
      </div>
      <FormMessage state={state} />
      <button className={`${btnPrimary} w-full`} disabled={pending}>{mode === "signup" ? "Create account" : "Sign in"}</button>
      <p className="text-center text-sm text-zinc-400">
        {mode === "signup" ? <>Have an account? <Link className="text-white underline" href={`/login${q}`}>Sign in</Link></>
          : <>New here? <Link className="text-white underline" href={`/signup${q}`}>Create an account</Link></>}
      </p>
    </form>
  );
}

/** A form bound to a server action, with its result message under the fields. */
export function ActionForm({ action, children, submit, className = "space-y-3", danger }: {
  action: Action; children: React.ReactNode; submit: string; className?: string; danger?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button className={danger ? btnDanger : btnPrimary} disabled={pending}>{pending ? "Saving…" : submit}</button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function ActionButton({ action, children, variant = "secondary", confirm }: {
  action: () => Promise<FormState | void>; children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(async () => (await action()) ?? undefined, undefined);
  const cls = { primary: btnPrimary, secondary: btnSecondary, danger: btnDanger }[variant];
  return (
    <form action={formAction} className="inline-flex flex-col gap-1"
      onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      <button className={cls} disabled={pending}>{children}</button>
      <FormMessage state={state} />
    </form>
  );
}
