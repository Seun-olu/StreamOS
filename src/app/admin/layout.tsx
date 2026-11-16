import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth";
import { getStaffRole } from "@/server/queries";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const role = await getStaffRole(user.id);
  if (!role) {
    return <div className="py-16 text-center"><h1 className="text-xl font-semibold">Staff only</h1><p className="mt-2 text-zinc-400">Ask an admin to give your account a staff role.</p></div>;
  }
  const link = "rounded px-2 py-1 text-zinc-300 hover:bg-zinc-800 hover:text-white";
  return (
    <div>
      <nav className="mb-6 flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3 text-sm" aria-label="Admin">
        <span className="mr-2 font-semibold">CMS</span>
        <Link className={link} href="/admin">Titles</Link>
        <Link className={link} href="/admin/assets">Media assets</Link>
        <Link className={link} href="/admin/activity">Activity</Link>
        {role === "admin" && <Link className={link} href="/admin/staff">Staff</Link>}
        <span className="ml-auto text-xs text-zinc-500" data-testid="staff-role">Signed in as {role}</span>
      </nav>
      {children}
    </div>
  );
}
