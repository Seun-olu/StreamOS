import Link from "next/link";
import type { ReactNode } from "react";
import { episodeLabel, formatRuntime, isFinished, progressPercent, type Snapshot } from "@/lib/catalog";
import { Artwork, Meta } from "./ui";

export interface ProgressInfo { episode_id: string | null; position_s: number; duration_s: number | null }

/** Detail page body, shared by the public page and the CMS preview (which passes playable=false). */
export function TitleView({ title, actions, progress = [], playable = true }: {
  title: Snapshot; actions?: ReactNode; progress?: ProgressInfo[]; playable?: boolean;
}) {
  const byEpisode = new Map(progress.map((p) => [p.episode_id, p]));
  const seasons = [...new Set(title.episodes.map((e) => e.season))];
  const licences = title.kind === "movie"
    ? (title.video ? [{ label: title.name, v: title.video }] : [])
    : title.episodes.filter((e) => e.video).map((e) => ({ label: `${episodeLabel(e)} ${e.name}`, v: e.video! }));
  return (
    <article>
      <div className="grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-end">
        <Artwork title={title} large decorative className="aspect-video w-full" />
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">{title.name}</h1>
          <Meta title={title} />
          <p className="leading-relaxed text-zinc-300">{title.synopsis}</p>
          {actions && <div className="flex flex-wrap items-start gap-3 pt-1">{actions}</div>}
        </div>
      </div>

      {title.kind === "series" && (
        <section className="mt-10" aria-label="Episodes">
          <h2 className="mb-3 text-xl font-semibold">Episodes</h2>
          {seasons.map((s) => (
            <div key={s} className="mb-6">
              {seasons.length > 1 && <h3 className="mb-2 text-sm font-semibold text-zinc-400">Season {s}</h3>}
              <ol className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
                {title.episodes.filter((e) => e.season === s).map((e) => {
                  const p = byEpisode.get(e.id);
                  const body = (
                    <div className="flex gap-4 p-4">
                      <span className="w-14 shrink-0 text-sm font-semibold text-zinc-400">{episodeLabel(e)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{e.name} <span className="text-sm font-normal text-zinc-500">{formatRuntime(e.video?.duration_s)}</span></p>
                        <p className="mt-0.5 text-sm text-zinc-400">{e.synopsis}</p>
                        {p && (
                          <p className="mt-1 text-xs text-zinc-500">
                            {isFinished(p.position_s, p.duration_s) ? "Watched" : `${progressPercent(p.position_s, p.duration_s)}% watched`}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                  return (
                    <li key={e.id}>
                      {playable ? <Link href={`/watch/${title.slug}?e=${e.id}`} className="block hover:bg-zinc-900" aria-label={`Play ${e.name}`}>{body}</Link> : body}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </section>
      )}

      <section className="mt-10 rounded-lg border border-zinc-800 p-4 text-sm" aria-label="Licence and source">
        <h2 className="mb-2 font-semibold">Licence and source</h2>
        {licences.length === 0 ? <p className="text-zinc-400">No video attached.</p> : (
          <ul className="space-y-2 text-zinc-400">
            {licences.map(({ label, v }) => (
              <li key={label}>
                <span className="text-zinc-200">{label}</span>: {v.license_url ? <a className="underline" href={v.license_url} rel="license noopener" target="_blank">{v.license}</a> : v.license}
                {" · "}{v.attribution}{" · "}
                <a className="underline" href={v.source_url} rel="noopener" target="_blank">Source</a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
