import Link from "next/link";
import { genreRows, isFinished } from "@/lib/catalog";
import { Artwork, btnPrimary, btnSecondary, Empty, Meta, Row, TitleCard } from "@/components/ui";
import { getUser } from "@/server/auth";
import { getActiveProfile, listPublished, recentlyWatched, watchlist } from "@/server/queries";

export default async function Home() {
  const [titles, user] = await Promise.all([listPublished(), getUser()]);
  if (!titles.length) return <Empty>Nothing has been published yet.</Empty>;
  const profile = user ? await getActiveProfile(user) : null;
  const [recent, list] = user && profile
    ? await Promise.all([recentlyWatched(user.id, profile.id), watchlist(user.id, profile.id)])
    : [[], []];
  const continuing = recent.filter((r) => !isFinished(r.position_s, r.duration_s));
  const hero = titles.find((t) => t.featured) ?? titles[0]!;
  const series = titles.filter((t) => t.kind === "series");

  return (
    <>
      <section className="mb-10 grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-end" aria-label="Featured">
        <Artwork title={hero} large decorative className="aspect-video w-full" />
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-red-400">Featured</p>
          <h1 className="text-3xl font-bold tracking-tight">{hero.name}</h1>
          <Meta title={hero} />
          <p className="text-zinc-300">{hero.synopsis}</p>
          <div className="flex gap-3">
            <Link href={`/watch/${hero.slug}`} className={btnPrimary}>▶ Play</Link>
            <Link href={`/title/${hero.slug}`} className={btnSecondary}>About {hero.name}</Link>
          </div>
        </div>
      </section>

      {continuing.length > 0 && (
        <Row title={`Continue watching for ${profile!.name}`}>
          {continuing.map((r) => <TitleCard key={r.title_id} title={r.d} progress={{ position: r.position_s, duration: r.duration_s }} />)}
        </Row>
      )}
      {list.length > 0 && <Row title="My list">{list.map((t) => <TitleCard key={t.id} title={t} />)}</Row>}
      <Row title="New on StreamOS">{titles.map((t) => <TitleCard key={t.id} title={t} />)}</Row>
      {series.length > 0 && <Row title="Series">{series.map((t) => <TitleCard key={t.id} title={t} />)}</Row>}
      {genreRows(titles).map((g) => <Row key={g.genre} title={g.genre}>{g.items.map((t) => <TitleCard key={t.id} title={t} />)}</Row>)}
      {recent.length > 0 && (
        <Row title="Recently watched">
          {recent.map((r) => <TitleCard key={r.title_id} title={r.d} progress={{ position: r.position_s, duration: r.duration_s }} />)}
        </Row>
      )}
    </>
  );
}
