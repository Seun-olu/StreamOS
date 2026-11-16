import { setStaffRole } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { card, input, label } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { getStaffRole, listStaff } from "@/server/queries";

export default async function Staff() {
  const user = await requireUser();
  if ((await getStaffRole(user.id)) !== "admin") return <p className="text-zinc-400">Only admins can manage staff.</p>;
  const staff = await listStaff(user.id);
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Staff</h1>
      <p className="text-sm text-zinc-400">Editors create and edit drafts and preview them. Admins also publish, unpublish, delete and manage staff.</p>
      <ul className="divide-y divide-zinc-800 text-sm">
        {staff.map((s) => <li key={s.user_id} className="flex justify-between py-2"><span>{s.display_name} <span className="text-zinc-500">{s.email}</span></span><span className="text-zinc-300">{s.role}</span></li>)}
      </ul>
      <section className={`${card} p-4`} aria-label="Change a role">
        <ActionForm action={setStaffRole} submit="Apply">
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <div><label htmlFor="staff-email" className={label}>Account email</label><input id="staff-email" name="email" type="email" required className={input} /></div>
            <div><label htmlFor="staff-role" className={label}>Role</label>
              <select id="staff-role" name="role" className={input} defaultValue="editor">
                <option value="editor">Editor</option><option value="admin">Admin</option><option value="none">Remove</option>
              </select></div>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
