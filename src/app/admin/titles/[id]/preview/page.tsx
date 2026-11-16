import Link from "next/link";
import { notFound } from "next/navigation";
import { TitleView } from "@/components/title-view";
import { requireUser } from "@/server/auth";
import { previewTitle } from "@/server/queries";

export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const title = await previewTitle(user.id, id);
  if (!title) notFound();
  return (
    <>
      <div role="note" className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-950">
        <span>Preview of the current draft. Viewers see this only after it is published.</span>
        <Link href={`/admin/titles/${id}`} className="underline">Back to editor</Link>
      </div>
      <TitleView title={title} playable={false} />
    </>
  );
}
