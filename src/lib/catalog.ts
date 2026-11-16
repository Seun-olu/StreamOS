/** Shape of a published (or previewed) title snapshot — see private.title_snapshot in the migration. */
export interface Video {
  url: string;
  duration_s: number | null;
  license: string;
  license_url: string | null;
  attribution: string;
  source_url: string;
}
export interface Episode {
  id: string;
  season: number;
  number: number;
  name: string;
  synopsis: string;
  video: Video | null;
}
export interface Snapshot {
  id: string;
  slug: string;
  kind: "movie" | "series";
  name: string;
  synopsis: string;
  year: number | null;
  genres: string[];
  rating: string | null;
  accent: string;
  featured: boolean;
  video: Video | null;
  episodes: Episode[];
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export function formatRuntime(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.max(1, m)}m`;
}

/** Where playback should resume: from the start if barely begun or essentially finished. */
export function resumePosition(position: number, duration: number | null): number {
  if (!Number.isFinite(position) || position < 5 || isFinished(position, duration)) return 0;
  return Math.floor(position);
}

/** Finished = within the last 5% (capped at 30 s, so credits count but short clips don't end early). */
export function isFinished(position: number, duration: number | null): boolean {
  return !!duration && duration - position <= Math.min(30, duration * 0.05);
}

export const progressPercent = (position: number, duration: number | null) =>
  duration ? Math.min(100, Math.max(0, Math.round((position / duration) * 100))) : 0;

export const episodeLabel = (e: Pick<Episode, "season" | "number">) => `S${e.season} · E${e.number}`;

export function totalRuntime(s: Pick<Snapshot, "kind" | "video" | "episodes">): number | null {
  if (s.kind === "movie") return s.video?.duration_s ?? null;
  const total = s.episodes.reduce((n, e) => n + (e.video?.duration_s ?? 0), 0);
  return total || null;
}

/** Group titles into rows by genre, keeping only genres with at least `min` titles. */
export function genreRows<T extends { genres: string[] }>(items: T[], min = 2): { genre: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const it of items) for (const g of it.genres) map.set(g, [...(map.get(g) ?? []), it]);
  return [...map.entries()].filter(([, v]) => v.length >= min).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([genre, items]) => ({ genre, items }));
}

/** Only same-origin relative paths are allowed as post-login redirects. */
export function safeNext(next: unknown): string {
  return typeof next === "string" && /^\/(?!\/)[^\\\s]*$/.test(next) ? next : "/";
}
