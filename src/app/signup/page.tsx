import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signUp } from "@/app/actions";
import { AuthForm } from "@/components/forms";
import { safeNext } from "@/lib/catalog";
import { getUser } from "@/server/auth";

export const metadata: Metadata = { title: "Create your account", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getUser()) redirect(next);
  return (
    <div className="mx-auto mt-10 max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">Create your account</h1>
      <AuthForm action={signUp} mode="signup" next={next} />
    </div>
  );
}
