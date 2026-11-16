import { saveAsset, saveEpisode, saveTitle } from "@/app/actions";
import type { AssetRow, EpisodeRow, TitleRow } from "@/server/queries";
import { ActionForm } from "./forms";
import { input, label } from "./ui";

function Field({ id, text, children }: { id: string; text: string; children: React.ReactNode }) {
  return <div><label htmlFor={id} className={label}>{text}</label>{children}</div>;
}

function AssetSelect({ id, assets, value }: { id: string; assets: Pick<AssetRow, "id" | "label" | "license">[]; value: string | null }) {
  return (
    <select id={id} name="asset_id" defaultValue={value ?? ""} className={input}>
      <option value="">No video yet</option>
      {assets.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.license})</option>)}
    </select>
  );
}

export function TitleForm({ title, assets }: { title?: TitleRow; assets: AssetRow[] }) {
  const p = title?.id ?? "new";
  return (
    <ActionForm action={saveTitle.bind(null, title?.id ?? null)} submit={title ? "Save draft" : "Create draft"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${p}-name`} text="Name"><input id={`${p}-name`} name="name" required maxLength={120} defaultValue={title?.name} className={input} /></Field>
        <Field id={`${p}-slug`} text="Slug (URL)"><input id={`${p}-slug`} name="slug" maxLength={80} defaultValue={title?.slug} placeholder="from the name" className={input} /></Field>
        <Field id={`${p}-kind`} text="Type">
          <select id={`${p}-kind`} name="kind" defaultValue={title?.kind ?? "movie"} className={input}>
            <option value="movie">Movie</option><option value="series">Series</option>
          </select>
        </Field>
        <Field id={`${p}-asset`} text="Video (movies only)"><AssetSelect id={`${p}-asset`} assets={assets} value={title?.asset_id ?? null} /></Field>
        <Field id={`${p}-year`} text="Year"><input id={`${p}-year`} name="year" type="number" min={1870} max={2100} defaultValue={title?.year ?? ""} className={input} /></Field>
        <Field id={`${p}-rating`} text="Rating"><input id={`${p}-rating`} name="rating" maxLength={10} defaultValue={title?.rating ?? ""} placeholder="U, PG, 12…" className={input} /></Field>
        <Field id={`${p}-genres`} text="Genres (comma separated)"><input id={`${p}-genres`} name="genres" maxLength={200} defaultValue={title?.genres.join(", ")} className={input} /></Field>
        <Field id={`${p}-accent`} text="Accent colour"><input id={`${p}-accent`} name="accent" type="color" defaultValue={title?.accent ?? "#4f46e5"} className="h-9 w-20 rounded border border-zinc-700 bg-zinc-900" /></Field>
      </div>
      <Field id={`${p}-synopsis`} text="Synopsis"><textarea id={`${p}-synopsis`} name="synopsis" rows={3} maxLength={2000} defaultValue={title?.synopsis} className={input} /></Field>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" name="featured" defaultChecked={title?.featured} /> Feature on the home page
      </label>
    </ActionForm>
  );
}

export function EpisodeForm({ titleId, episode, assets, nextNumber }: { titleId: string; episode?: EpisodeRow; assets: AssetRow[]; nextNumber?: number }) {
  const p = episode?.id ?? "new-ep";
  return (
    <ActionForm action={saveEpisode.bind(null, titleId, episode?.id ?? null)} submit={episode ? "Save episode" : "Add episode"}>
      <div className="grid gap-3 sm:grid-cols-[5rem_5rem_1fr_1fr]">
        <Field id={`${p}-season`} text="Season"><input id={`${p}-season`} name="season" type="number" min={1} max={99} required defaultValue={episode?.season ?? 1} className={input} /></Field>
        <Field id={`${p}-number`} text="Episode"><input id={`${p}-number`} name="number" type="number" min={1} max={999} required defaultValue={episode?.number ?? nextNumber ?? 1} className={input} /></Field>
        <Field id={`${p}-name`} text="Episode name"><input id={`${p}-name`} name="name" required maxLength={120} defaultValue={episode?.name} className={input} /></Field>
        <Field id={`${p}-asset`} text="Video"><AssetSelect id={`${p}-asset`} assets={assets} value={episode?.asset_id ?? null} /></Field>
      </div>
      <Field id={`${p}-synopsis`} text="Episode synopsis"><textarea id={`${p}-synopsis`} name="synopsis" rows={2} maxLength={2000} defaultValue={episode?.synopsis} className={input} /></Field>
    </ActionForm>
  );
}

export function AssetForm({ asset }: { asset?: AssetRow }) {
  const p = asset?.id ?? "new-asset";
  return (
    <ActionForm action={saveAsset.bind(null, asset?.id ?? null)} submit={asset ? "Save asset" : "Add asset"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${p}-label`} text="Label"><input id={`${p}-label`} name="label" required maxLength={120} defaultValue={asset?.label} className={input} /></Field>
        <Field id={`${p}-url`} text="Video URL (https:// or /path)"><input id={`${p}-url`} name="video_url" required defaultValue={asset?.video_url} className={input} /></Field>
        <Field id={`${p}-duration`} text="Duration (seconds)"><input id={`${p}-duration`} name="duration_s" type="number" step="0.01" min={0} defaultValue={asset?.duration_s ?? ""} className={input} /></Field>
        <Field id={`${p}-license`} text="Licence"><input id={`${p}-license`} name="license" required maxLength={120} defaultValue={asset?.license} placeholder="CC BY 3.0, Public domain (US)…" className={input} /></Field>
        <Field id={`${p}-license-url`} text="Licence URL"><input id={`${p}-license-url`} name="license_url" defaultValue={asset?.license_url ?? ""} className={input} /></Field>
        <Field id={`${p}-source`} text="Source page"><input id={`${p}-source`} name="source_url" required defaultValue={asset?.source_url} className={input} /></Field>
      </div>
      <Field id={`${p}-attribution`} text="Attribution"><input id={`${p}-attribution`} name="attribution" required maxLength={300} defaultValue={asset?.attribution} className={input} /></Field>
    </ActionForm>
  );
}
