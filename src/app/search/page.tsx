import type { Metadata } from "next";
import { Empty, TitleCard } from "@/components/ui";
import { searchPublished } from "@/server/queries";

type Props = { searchParams: Promise<{ q?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = String((await searchParams).q ?? "").trim();
  return { title: q ? `Search: ${q}` : "Search", robots: { index: false } };
}

export default async function Search({ searchParams }: Props) {
  const raw = (await searchParams).q;
  const q = String(Array.isArray(raw) ? raw[0] : raw ?? "").trim().slice(0, 100);
  const results = q ? await searchPublished(q) : [];
  return (
    <>
      <form className="mb-6 flex max-w-xl gap-2" role="search">
        <label htmlFor="q" className="sr-only">Search titles</label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Titles, genres, episodes…" autoFocus
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 placeholder:text-zinc-500 focus:border-zinc-400 focus:outline-none" />
        <button className="rounded-md bg-white px-4 text-sm font-semibold text-zinc-950">Search</button>
      </form>
      {q && <h1 className="mb-4 text-lg font-semibold">{results.length} result{results.length === 1 ? "" : "s"} for “{q}”</h1>}
      {q && !results.length && <Empty>No titles match. Try a genre such as “animation”, or an episode name.</Empty>}
      <div className="flex flex-wrap gap-4">{results.map((t) => <TitleCard key={t.id} title={t} />)}</div>
    </>
  );
}
