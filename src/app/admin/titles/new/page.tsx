import { TitleForm } from "@/components/admin-forms";
import { requireUser } from "@/server/auth";
import { listAssets } from "@/server/queries";

export default async function NewTitle() {
  const user = await requireUser();
  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-2xl font-bold">New title</h1>
      <TitleForm assets={await listAssets(user.id)} />
    </div>
  );
}
