import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { toggleWatchlist } from "@/app/actions";
import { ActionButton } from "@/components/forms";
import { TitleView } from "@/components/title-view";
import { btnPrimary } from "@/components/ui";
import { isFinished, totalRuntime } from "@/lib/catalog";
import { siteUrl } from "@/lib/site";
import { getUser } from "@/server/auth";
import { getActiveProfile, getPublished, inWatchlist, titleProgress } from "@/server/queries";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const title = await getPublished((await params).slug);
  if (!title) return { title: "Not found" };
  return {
    title: title.name,
    description: title.synopsis.slice(0, 160),
    alternates: { canonical: `/title/${title.slug}` },
    openGraph: { title: title.name, description: title.synopsis.slice(0, 200), type: title.kind === "movie" ? "video.movie" : "video.tv_show", url: `/title/${title.slug}` },
  };
}

export default async function TitlePage({ params }: Props) {
  const title = await getPublished((await params).slug);
  if (!title) notFound();
  const user = await getUser();
  const profile = user ? await getActiveProfile(user) : null;
  const [saved, progress] = user && profile
    ? await Promise.all([inWatchlist(user.id, profile.id, title.id), titleProgress(user.id, profile.id, title.id)])
    : [false, []];

  // Resume the most recent unfinished movie/episode; otherwise start at the beginning.
  const latest = progress[0];
  const resume = latest && !isFinished(latest.position_s, latest.duration_s) ? latest : null;
  const playHref = `/watch/${title.slug}${resume?.episode_id ? `?e=${resume.episode_id}` : ""}`;
  const playLabel = resume ? (title.kind === "series" ? `▶ Resume ${title.episodes.find((e) => e.id === resume.episode_id)?.name ?? ""}` : "▶ Resume") : "▶ Play";

  const runtime = totalRuntime(title);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": title.kind === "movie" ? "Movie" : "TVSeries",
    name: title.name,
    description: title.synopsis,
    url: `${siteUrl}/title/${title.slug}`,
    ...(title.year ? { datePublished: String(title.year) } : {}),
    ...(title.genres.length ? { genre: title.genres } : {}),
    ...(title.kind === "movie" && runtime ? { duration: `PT${Math.round(runtime / 60)}M` } : {}),
    ...(title.kind === "series" ? { numberOfEpisodes: title.episodes.length } : {}),
    ...(title.video?.license_url ? { license: title.video.license_url } : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <TitleView title={title} progress={progress} actions={<>
        <Link href={playHref} className={btnPrimary}>{playLabel}</Link>
        {user
          ? <ActionButton action={toggleWatchlist.bind(null, title.id, title.slug)}>{saved ? "✓ In my list" : "+ My list"}</ActionButton>
          : <Link href={`/login?next=/title/${title.slug}`} className="self-center text-sm text-zinc-400 underline">Sign in to save to your list</Link>}
      </>} />
    </>
  );
}
