import Link from "next/link";
import type { ReactNode } from "react";
import { formatRuntime, progressPercent, totalRuntime, type Snapshot } from "@/lib/catalog";

export const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
export const btnPrimary = `${btn} bg-white text-zinc-950 hover:bg-zinc-200`;
export const btnSecondary = `${btn} bg-zinc-800 text-zinc-100 hover:bg-zinc-700`;
export const btnDanger = `${btn} bg-red-950 text-red-200 ring-1 ring-red-800 hover:bg-red-900`;
export const input =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-400 focus:outline-none";
export const label = "mb-1 block text-xs font-medium text-zinc-400";
export const card = "rounded-lg border border-zinc-800 bg-zinc-900/60";

export function FormMessage({ state }: { state: { error?: string; ok?: string } | undefined }) {
  if (state?.error) return <p role="alert" className="text-sm text-red-400">{state.error}</p>;
  if (state?.ok) return <p role="status" className="text-sm text-emerald-400">{state.ok}</p>;
  return null;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-400">{children}</div>;
}

export const fmtDate = (d: Date | string | null) =>
  d ? new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC" : "—";

/** Generated key art: the title on its accent colour. Needs no image download, so it never hurts LCP. */
export function Artwork({ title, className = "", large = false, decorative = false }: { title: Pick<Snapshot, "name" | "accent" | "year" | "kind">; className?: string; large?: boolean; decorative?: boolean }) {
  return (
    <div aria-hidden={decorative || undefined} className={`relative flex overflow-hidden rounded-md ${className}`}
      style={{ background: `linear-gradient(135deg, ${title.accent} 0%, #09090b 110%)` }}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.18),transparent_45%)]" />
      <div className="relative mt-auto p-3">
        <p className={`font-black leading-tight tracking-tight text-white drop-shadow ${large ? "text-4xl sm:text-5xl" : "text-lg"}`}>{title.name}</p>
        <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-white/70">{title.kind === "series" ? "Series" : "Film"}{title.year ? ` · ${title.year}` : ""}</p>
      </div>
    </div>
  );
}

export function TitleCard({ title, progress }: { title: Snapshot; progress?: { position: number; duration: number | null } }) {
  return (
    <Link href={`/title/${title.slug}`} className="group block w-44 shrink-0 focus-visible:outline-2 focus-visible:outline-white sm:w-52">
      <Artwork title={title} decorative className="aspect-video transition group-hover:ring-2 group-hover:ring-white/60" />
      {progress && (
        <div className="mt-1 h-1 rounded bg-zinc-700" role="progressbar" aria-label={`${title.name} progress`}
          aria-valuenow={progressPercent(progress.position, progress.duration)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-1 rounded bg-red-600" style={{ width: `${progressPercent(progress.position, progress.duration)}%` }} />
        </div>
      )}
      <p className="mt-1.5 truncate text-sm text-zinc-300">{title.name}</p>
    </Link>
  );
}

export function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8" aria-label={title}>
      <h2 className="mb-3 text-lg font-semibold text-zinc-100">{title}</h2>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">{children}</div>
    </section>
  );
}

export function Meta({ title }: { title: Snapshot }) {
  const parts = [title.year, title.rating && `Rated ${title.rating}`, title.kind === "series" ? `${title.episodes.length} episodes` : null, formatRuntime(totalRuntime(title))]
    .filter(Boolean);
  return <p className="text-sm text-zinc-400">{parts.join(" · ")}{title.genres.length ? ` · ${title.genres.join(", ")}` : ""}</p>;
}

export function StatusBadge({ status }: { status: "published" | "draft" | "changed" }) {
  const style = { published: "bg-emerald-950 text-emerald-300 ring-emerald-800", draft: "bg-zinc-800 text-zinc-300 ring-zinc-700", changed: "bg-amber-950 text-amber-300 ring-amber-800" }[status];
  const text = { published: "Published", draft: "Draft", changed: "Unpublished changes" }[status];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}>{text}</span>;
}
