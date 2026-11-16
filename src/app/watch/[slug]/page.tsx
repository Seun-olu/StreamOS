import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Player } from "@/components/player";
import { btnSecondary } from "@/components/ui";
import { episodeLabel, resumePosition } from "@/lib/catalog";
import { requireUser } from "@/server/auth";
import { getActiveProfile, getPublished, titleProgress } from "@/server/queries";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ e?: string }> };

export const metadata: Metadata = { robots: { index: false } };

export default async function Watch({ params, searchParams }: Props) {
  const { slug } = await params;
  const { e } = await searchParams;
  const user = await requireUser();
  const title = await getPublished(slug);
  if (!title) notFound();
  const profile = await getActiveProfile(user);
  if (!profile) redirect("/profiles");
  const progress = await titleProgress(user.id, profile.id, title.id);

  let episode = title.kind === "series" ? title.episodes.find((x) => x.id === e) : undefined;
  if (title.kind === "series" && !episode) {
    episode = title.episodes.find((x) => x.id === progress[0]?.episode_id) ?? title.episodes[0];
  }
  const video = title.kind === "series" ? episode?.video : title.video;
  if (!video) notFound();
  const saved = progress.find((p) => p.episode_id === (episode?.id ?? null));
  const start = saved ? resumePosition(saved.position_s, saved.duration_s) : 0;
  const idx = episode ? title.episodes.indexOf(episode) : -1;
  const next = idx >= 0 ? title.episodes[idx + 1] : undefined;
  const label = episode ? `${title.name}: ${episodeLabel(episode)} ${episode.name}` : title.name;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/title/${title.slug}`} className="text-sm text-zinc-400 hover:text-white">← {title.name}</Link>
      <h1 className="mb-3 mt-1 text-xl font-semibold">{episode ? <>{episodeLabel(episode)} · {episode.name}</> : title.name}</h1>
      <Player key={episode?.id ?? title.id} src={video.url} start={start} titleId={title.id} episodeId={episode?.id ?? null} label={label} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
        <p>
          Watching as {profile.name}. {video.license}: {video.attribution}{" "}
          <a href={video.source_url} target="_blank" rel="noopener" className="underline">Source</a>
        </p>
        {next && <Link href={`/watch/${title.slug}?e=${next.id}`} className={btnSecondary}>Next: {next.name} →</Link>}
      </div>
    </div>
  );
}
