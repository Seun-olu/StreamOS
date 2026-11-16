import Link from "next/link";
import { genreRows, isFinished } from "@/lib/catalog";
import { Artwork, btnPrimary, btnSecondary, Empty, Meta, Row, TitleCard } from "@/components/ui";
import { getUser } from "@/server/auth";
import { isEphemeralDemo } from "@/server/db";
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
      {!user && (
        <section aria-labelledby="welcome" className="mb-10 rounded-2xl border border-zinc-800 bg-gradient-to-br from-red-950/60 via-zinc-950 to-zinc-950 px-6 py-10 sm:px-10">
          <h1 id="welcome" className="max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">Free films and series you can actually share.</h1>
          <p className="mt-3 max-w-2xl text-zinc-300">
            Every title on StreamOS is openly licensed or in the public domain, with its licence and source shown on the page.
            Browse and search without an account; sign up to keep a list, pick up where you left off, and add profiles for the household.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {!isEphemeralDemo() && <Link href="/signup" className={btnPrimary}>Create a free account</Link>}
            <Link href={`/title/${hero.slug}`} className={btnSecondary}>Browse {hero.name}</Link>
          </div>
        </section>
      )}
      <section className="mb-10 grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-end" aria-label="Featured">
        <Artwork title={hero} large decorative className="aspect-video w-full" />
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-red-400">Featured</p>
          {user ? <h1 className="text-3xl font-bold tracking-tight">{hero.name}</h1> : <h2 className="text-3xl font-bold tracking-tight">{hero.name}</h2>}
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
