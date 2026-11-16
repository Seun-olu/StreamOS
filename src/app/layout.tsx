import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/actions";
import { siteUrl } from "@/lib/site";
import { getUser } from "@/server/auth";
import { isEphemeralDemo } from "@/server/db";
import { getActiveProfile, getStaffRole } from "@/server/queries";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "StreamOS", template: "%s · StreamOS" },
  description: "Stream openly licensed and public-domain films and series.",
  openGraph: { siteName: "StreamOS", type: "website" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  const [role, profile] = user ? await Promise.all([getStaffRole(user.id), getActiveProfile(user)]) : [null, null];
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-1 focus:text-zinc-950">Skip to content</a>
        {isEphemeralDemo() && (
        <div role="note" className="bg-amber-300 px-4 py-2 text-center text-sm font-medium text-zinc-950">
          Preview: browsing works, but accounts are switched off until this deployment is connected to a database.
        </div>
      )}
        <header className="sticky top-0 z-40 border-b border-zinc-900 bg-zinc-950/90 backdrop-blur">
          <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6" aria-label="Main">
            <Link href="/" className="text-lg font-black tracking-tight text-red-400">StreamOS</Link>
            <Link href="/" className="text-sm text-zinc-300 hover:text-white">Home</Link>
            {user && <Link href="/my-list" className="text-sm text-zinc-300 hover:text-white">My list</Link>}
            {role && <Link href="/admin" className="text-sm text-zinc-300 hover:text-white">Admin</Link>}
            <form action="/search" role="search" className="ml-auto">
              <label htmlFor="site-search" className="sr-only">Search titles</label>
              <input id="site-search" name="q" type="search" placeholder="Search" className="w-36 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-sm placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none sm:w-56" />
            </form>
            {user ? (
              <div className="flex items-center gap-3 text-sm">
                <Link href="/profiles" className="flex items-center gap-2 text-zinc-300 hover:text-white" data-testid="active-profile">
                  <span aria-hidden className="inline-block h-6 w-6 rounded" style={{ background: profile?.color ?? "#6366f1" }} />
                  {profile?.name ?? "Profiles"}
                </Link>
                <form action={signOut}><button className="text-zinc-400 hover:text-white">Sign out</button></form>
              </div>
            ) : (
              <Link href="/login" className="text-sm font-semibold text-white">Sign in</Link>
            )}
          </nav>
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4 text-xs text-zinc-400 sm:px-6">
          Every title is openly licensed or in the public domain; each one lists its licence and source.
          Video is streamed from the Internet Archive.
        </footer>
      </body>
    </html>
  );
}
