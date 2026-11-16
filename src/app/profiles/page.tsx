import type { Metadata } from "next";
import { createProfile, deleteProfile, selectProfile } from "@/app/actions";
import { ActionButton, ActionForm } from "@/components/forms";
import { card, input, label } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { getActiveProfile, listProfiles } from "@/server/queries";

export const metadata: Metadata = { title: "Profiles", robots: { index: false } };

export default async function Profiles() {
  const user = await requireUser();
  const [profiles, active] = await Promise.all([listProfiles(user.id), getActiveProfile(user)]);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-center text-3xl font-bold">Who’s watching?</h1>
      <ul className="mb-10 flex flex-wrap justify-center gap-6">
        {profiles.map((p) => (
          <li key={p.id} className="flex w-28 flex-col items-center gap-2">
            <form action={selectProfile.bind(null, p.id)}>
              <button className={`flex h-24 w-24 items-center justify-center rounded-lg text-3xl font-black text-white ${p.id === active?.id ? "ring-4 ring-white" : "hover:ring-2 hover:ring-zinc-400"}`}
                style={{ background: p.color }} aria-label={`Watch as ${p.name}`} aria-current={p.id === active?.id}>
                {p.name.slice(0, 1).toUpperCase()}
              </button>
            </form>
            <span className="text-sm">{p.name}</span>
            {profiles.length > 1 && <ActionButton action={deleteProfile.bind(null, p.id)} variant="danger" confirm={`Delete ${p.name} and its list and history?`}>Delete</ActionButton>}
          </li>
        ))}
      </ul>
      {profiles.length < 5 && (
        <div className={`${card} mx-auto max-w-sm p-4`}>
          <ActionForm action={createProfile} submit="Add profile">
            <div>
              <label htmlFor="profile-name" className={label}>New profile name</label>
              <input id="profile-name" name="name" required maxLength={40} className={input} />
            </div>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
