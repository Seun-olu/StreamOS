import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Empty, TitleCard } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { getActiveProfile, watchlist } from "@/server/queries";

export const metadata: Metadata = { title: "My list", robots: { index: false } };

export default async function MyList() {
  const user = await requireUser();
  const profile = await getActiveProfile(user);
  if (!profile) redirect("/profiles");
  const titles = await watchlist(user.id, profile.id);
  return (
    <>
      <h1 className="mb-5 text-2xl font-bold">My list <span className="text-base font-normal text-zinc-400">· {profile.name}</span></h1>
      {titles.length ? <div className="flex flex-wrap gap-4">{titles.map((t) => <TitleCard key={t.id} title={t} />)}</div>
        : <Empty>Nothing saved yet. Use “+ My list” on any title.</Empty>}
    </>
  );
}
