import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signIn } from "@/app/actions";
import { AuthForm } from "@/components/forms";
import { isEphemeralDemo } from "@/server/db";
import { safeNext } from "@/lib/catalog";
import { getUser } from "@/server/auth";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getUser()) redirect(next);
  return (
    <div className="mx-auto mt-10 max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">Sign in</h1>
      {isEphemeralDemo() ? (
        <div role="note" className="rounded-lg border border-amber-500/50 bg-amber-950/40 p-4 text-sm text-amber-100">
          <p className="font-semibold">Accounts aren&apos;t available on this preview yet.</p>
          <p className="mt-1">This deployment isn&apos;t connected to a database, so sign-up and sign-in are switched off rather than losing your account. You can still browse and watch everything.</p>
        </div>
      ) : (
        <AuthForm action={signIn} mode="login" next={next} />
      )}
    </div>
  );
}
