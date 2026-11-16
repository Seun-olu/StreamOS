import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteEpisode, deleteTitle, publishTitle, unpublishTitle } from "@/app/actions";
import { EpisodeForm, TitleForm } from "@/components/admin-forms";
import { ActionButton } from "@/components/forms";
import { btnSecondary, card, fmtDate, StatusBadge } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { getStaffRole, getTitle, listAssets } from "@/server/queries";

export default async function EditTitle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const [data, assets, role] = await Promise.all([getTitle(user.id, id), listAssets(user.id), getStaffRole(user.id)]);
  if (!data) notFound();
  const { title, episodes, issues } = data;
  const status = !title.published_at ? "draft" : new Date(title.updated_at) > new Date(title.published_at) ? "changed" : "published";
  const isAdmin = role === "admin";

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{title.name}</h1>
        <StatusBadge status={status} />
        {title.version && <span className="text-sm text-zinc-400">v{title.version} published {fmtDate(title.published_at)}</span>}
      </div>

      <section className={`${card} space-y-3 p-4`} aria-label="Publishing">
        <div className="flex flex-wrap items-start gap-3">
          <Link href={`/admin/titles/${title.id}/preview`} className={btnSecondary}>Preview draft</Link>
          {title.published_at && <Link href={`/title/${title.slug}`} className={btnSecondary}>View live</Link>}
          {isAdmin && <ActionButton action={publishTitle.bind(null, title.id)} variant="primary">{title.published_at ? "Republish" : "Publish"}</ActionButton>}
          {isAdmin && title.published_at && <ActionButton action={unpublishTitle.bind(null, title.id)} variant="danger" confirm="Remove this title from the public site?">Unpublish</ActionButton>}
        </div>
        {issues.length > 0 ? (
          <div role="note" aria-label="Publish checks" className="text-sm text-amber-300">
            Can’t publish yet:<ul className="ml-5 list-disc">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        ) : <p className="text-sm text-emerald-400">Ready to publish.</p>}
        {!isAdmin && <p className="text-xs text-zinc-500">Editors can save drafts and preview; an admin publishes.</p>}
      </section>

      <section className={`${card} p-4`} aria-label="Details">
        <h2 className="mb-3 font-semibold">Details</h2>
        <TitleForm title={title} assets={assets} />
      </section>

      {title.kind === "series" && (
        <section className={`${card} space-y-4 p-4`} aria-label="Episodes">
          <h2 className="font-semibold">Episodes</h2>
          {episodes.map((e) => (
            <details key={e.id} className="rounded border border-zinc-800 p-3">
              <summary className="cursor-pointer text-sm">S{e.season} · E{e.number} {e.name} {!e.asset_id && <span className="text-amber-300">(no video)</span>}</summary>
              <div className="mt-3 space-y-3">
                <EpisodeForm titleId={title.id} episode={e} assets={assets} />
                <ActionButton action={deleteEpisode.bind(null, title.id, e.id)} variant="danger" confirm={`Delete episode “${e.name}”?`}>Delete episode</ActionButton>
              </div>
            </details>
          ))}
          <div className="border-t border-zinc-800 pt-4">
            <h3 className="mb-2 text-sm font-semibold text-zinc-300">Add episode</h3>
            <EpisodeForm titleId={title.id} assets={assets} nextNumber={(episodes.at(-1)?.number ?? 0) + 1} />
          </div>
        </section>
      )}

      {isAdmin && (
        <section className="border-t border-zinc-800 pt-4" aria-label="Danger zone">
          <ActionButton action={deleteTitle.bind(null, title.id)} variant="danger" confirm="Delete this title, its episodes and viewers’ progress for it? This can’t be undone.">Delete title</ActionButton>
        </section>
      )}
    </div>
  );
}
