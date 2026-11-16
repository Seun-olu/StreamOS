import Link from "next/link";
import { Empty, fmtDate } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { listEvents } from "@/server/queries";

export default async function Activity() {
  const user = await requireUser();
  const events = await listEvents(user.id);
  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-2xl font-bold">Activity</h1>
      {!events.length ? <Empty>No activity yet.</Empty> : (
        <ol className="divide-y divide-zinc-800 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-3 py-2">
              <span className="w-44 text-zinc-500">{fmtDate(e.at)}</span>
              <span>
                <span className="font-medium">{e.actor}</span> {e.action}{" "}
                {e.title_id ? <Link className="underline" href={`/admin/titles/${e.title_id}`}>{e.title_name}</Link> : e.title_name}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
