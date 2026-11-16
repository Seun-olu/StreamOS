import { AssetForm } from "@/components/admin-forms";
import { card } from "@/components/ui";
import { formatRuntime } from "@/lib/catalog";
import { requireUser } from "@/server/auth";
import { listAssets } from "@/server/queries";

export default async function Assets() {
  const user = await requireUser();
  const assets = await listAssets(user.id);
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">Media assets</h1>
      <p className="text-sm text-zinc-400">Each video records its licence, attribution and source. Only use openly licensed or public-domain video you can link to.</p>
      <ul className="space-y-2">
        {assets.map((a) => (
          <li key={a.id}>
            <details className={`${card} p-3`}>
              <summary className="cursor-pointer text-sm">
                <span className="font-medium">{a.label}</span>
                <span className="text-zinc-400"> · {a.license} · {formatRuntime(Number(a.duration_s)) || "duration unknown"} · used by {a.used_by}</span>
              </summary>
              <div className="mt-3"><AssetForm asset={a} /></div>
            </details>
          </li>
        ))}
      </ul>
      <section className={`${card} p-4`} aria-label="Add asset">
        <h2 className="mb-3 font-semibold">Add asset</h2>
        <AssetForm />
      </section>
    </div>
  );
}
