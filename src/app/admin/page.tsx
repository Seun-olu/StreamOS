import Link from "next/link";
import { btnPrimary, Empty, fmtDate, StatusBadge } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { listTitles } from "@/server/queries";

export default async function AdminTitles() {
  const user = await requireUser();
  const titles = await listTitles(user.id);
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Titles</h1>
        <Link href="/admin/titles/new" className={btnPrimary}>New title</Link>
      </div>
      {!titles.length ? <Empty>No titles yet.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500"><tr><th className="py-2 pr-4">Title</th><th className="pr-4">Type</th><th className="pr-4">Status</th><th className="pr-4">Published</th><th>Last edit</th></tr></thead>
            <tbody className="divide-y divide-zinc-800">
              {titles.map((t) => (
                <tr key={t.id}>
                  <td className="py-2 pr-4"><Link className="font-medium underline-offset-2 hover:underline" href={`/admin/titles/${t.id}`}>{t.name}</Link></td>
                  <td className="pr-4 text-zinc-400">{t.kind}{t.kind === "series" ? ` · ${t.episodes} ep` : ""}</td>
                  <td className="pr-4"><StatusBadge status={!t.published_at ? "draft" : new Date(t.updated_at) > new Date(t.published_at) ? "changed" : "published"} /></td>
                  <td className="pr-4 text-zinc-400">{t.version ? `v${t.version} · ${fmtDate(t.published_at)}` : "—"}</td>
                  <td className="text-zinc-400">{fmtDate(t.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
