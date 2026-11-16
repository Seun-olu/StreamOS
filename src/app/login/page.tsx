import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signIn } from "@/app/actions";
import { AuthForm } from "@/components/forms";
import { safeNext } from "@/lib/catalog";
import { getUser } from "@/server/auth";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getUser()) redirect(next);
  return (
    <div className="mx-auto mt-10 max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">Sign in</h1>
      <AuthForm action={signIn} mode="login" next={next} />
    </div>
  );
}
