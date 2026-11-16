# StreamOS

A streaming site for openly licensed and public-domain films and series, with its own database-backed CMS. Staff draft titles, preview them, and publish or unpublish them. Viewers browse, search, keep a list, and resume where they left off, separately for each profile.

**Status:** runs locally end to end on an embedded Postgres (PGlite). Not deployed. No hosted database yet (see [Limits](#limits)).

## What works

| Area | Status |
|---|---|
| CMS at `/admin`: titles (movies and series), episodes, media assets with licence, attribution and source per asset | Tested (PGlite + Playwright) |
| Draft → preview → publish / republish / unpublish. The public site reads only published snapshots, so edits stay private until republished. Publish checks block incomplete titles | Tested (PGlite + Playwright) |
| Roles: admin (publish, unpublish, delete, manage staff) and editor (draft and preview), enforced by RLS and role-checked SQL functions | Tested (PGlite + Playwright) |
| Public discovery: featured title, rows by recency, series and genre, detail pages with episodes and licence block | Tested (Playwright) |
| Postgres full-text search (`tsvector` over name, synopsis, genres and episode text, ranked) | Tested (PGlite + Playwright) |
| Player: HTML5 video that saves progress (every 10 s, on pause, end and tab hide) and resumes from it; next-episode link | Tested (Playwright, local test clip) |
| Viewer profiles (up to 5 per account): watchlist, continue watching and recently watched are per profile | Tested (PGlite + Playwright) |
| SEO: per-title metadata, Open Graph, canonical URLs, JSON-LD (`Movie` / `TVSeries`), `sitemap.xml`, `robots.txt` | Tested (Playwright) |
| Hosted Postgres driver (`DATABASE_URL`, postgres.js) with auto-migrate and seed | Tested against PGlite served over the Postgres wire protocol (sign-up, admin, watchlist); not yet against Neon or Supabase |
| Netlify serverless (demo mode in `/tmp`) | Tested by simulating the Lambda environment locally; sign-up, watchlist |

## Content and licences

The demo catalogue (`db/seed.sql`) streams from the Internet Archive; no film is copied into this repo.

| Title | Licence | Credit |
|---|---|---|
| Sintel (2010) | CC BY 3.0 | Blender Foundation |
| Big Buck Bunny (2008) | CC BY 3.0 | Blender Foundation |
| Tears of Steel (2012) | CC BY 3.0 | Blender Foundation |
| Superman (1941), 3 Fleischer/Famous Studios shorts | Public domain (US), copyright not renewed | Fleischer Studios / Famous Studios |
| Spring (2019) | Left as a draft with no video, to show publish checks | — |
| Test pattern (20 s, `public/media/test-pattern.mp4`) | CC0, generated with ffmpeg | Used by the e2e tests |

Each asset stores its licence, licence URL, attribution and source page, and every title page shows them. Public-domain status is as recorded by the source; check it yourself before any commercial use.

## How it works

```
db/migrations/0001_init.sql  Schema, RLS, triggers, publish/preview functions (Supabase-compatible)
db/seed.sql                  Demo catalogue, loaded into an empty local database
src/lib/catalog.ts           Snapshot types and pure helpers (resume rules, runtimes, genre rows, safe redirects)
src/server/db.ts             PGlite (local) or postgres.js (DATABASE_URL); migrations and seed for PGlite
src/server/auth.ts           Local accounts: scrypt hashes, HMAC-signed httpOnly session cookie
src/server/queries.ts        Reads: public ones as `anon`, signed-in ones as the user, so RLS applies
src/app/actions.ts           Server actions (Zod-validated): auth, profiles, watchlist, progress, CMS
src/components/player.tsx    Video player with progress saving
```

**Drafts vs published.** Staff edit `titles`, `episodes` and `media_assets`. None of these tables can be read by anonymous users or by signed-in viewers. `publish_title()` validates the draft, then snapshots it as JSON into `publications`, the only content table the public can read. The snapshot includes episodes and licence data. Each publish bumps a version number and is logged in `content_events`. A title shows **Unpublished changes** when the draft has been edited after its last publish, including edits to its episodes or assets. Preview renders the draft snapshot with the same component as the public page.

**Authorisation.** Every query runs as the Postgres `anon` or `authenticated` role, with the user id set in `request.jwt.claims` the way Supabase does it, so RLS decides what each query can see. Role helpers live in the non-exposed `private` schema. Publishing and preview are `security definer` functions that check the caller's role first. Watchlist and progress rows belong to a viewer profile, and RLS only lets an account reach its own profiles. A trigger also refuses watchlist or progress rows for titles that aren't published.

**First account.** On a fresh database, the first account to sign up becomes admin. Admins can then give other accounts the editor or admin role at `/admin/staff`. At least one admin must always remain.

## Run locally

Requires Node 22 (`.nvmrc`).

```bash
npm install
npm run dev          # http://localhost:3006 — data persists in .data/pglite, demo catalogue seeded on first run
```

Sign up (the first account is admin), open **Admin**, and try publishing **Spring** after attaching the test-pattern asset.

| Var | Purpose |
|---|---|
| `SESSION_SECRET` | 32+ chars; required when `NODE_ENV=production` (unless `STREAMOS_LOCAL_DEMO=1`) |
| `DATABASE_URL` / `NETLIFY_DATABASE_URL` | Use a hosted Postgres instead of PGlite (migrations run automatically) |
| `PGLITE_DIR` | Where PGlite stores data (default `.data/pglite`) |
| `STREAMOS_SEED` | Set to `0` to skip the demo catalogue |
| `NEXT_PUBLIC_SITE_URL` | Absolute URL for canonical links, sitemap and JSON-LD (default `http://localhost:3006`) |

## Deploying on Netlify

The site deploys as-is: Netlify's Next.js runtime builds it, and `next.config.ts` bundles the SQL migrations and PGlite files into the server function.

- **Without a database** (the default), the app runs in **demo mode**: the embedded database lives in the function's `/tmp`, so accounts and changes reset whenever Netlify recycles the function. A banner tells visitors.
- **For permanent data**, connect a Postgres database:
  - In Netlify, add the Neon extension or Netlify DB; it sets `NETLIFY_DATABASE_URL`. Any Postgres works through `DATABASE_URL` instead.
  - Also set `SESSION_SECRET` to a random string of 32+ characters (for example from `openssl rand -base64 48`). Production refuses to start without one once a database is connected.
  - Then redeploy. Migrations, and the demo seed where there is one, run automatically on first connection. `DATABASE_POOL_MAX` caps connections; the default is 5.

## Tests

```bash
npm run lint && npm run typecheck
npm test             # Vitest: helpers, auth, and schema/RLS/publishing/search/viewer data in PGlite
npm run test:e2e     # Playwright with local Chrome (channel: "chrome") against a fresh PGlite dir
```

## Performance

Lighthouse 12.8.2, run on 2026-11-16 against `next start` (production build, local PGlite, seeded catalogue) on the development Mac with headless Chrome. The default mobile profile is throttled and the `--preset=desktop` profile is not. Scores are performance / accessibility / best practices / SEO.

| Page | Mode | Perf | A11y | Best pr. | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|---|
| `/` | mobile | 99 | 95 | 100 | 100 | 0.8 s | 2.1 s | 20 ms | 0 |
| `/` | desktop | 100 | 95 | 100 | 100 | 0.2 s | 0.4 s | 0 ms | 0 |
| `/title/sintel` | mobile | 99 | 96 | 100 | 100 | 0.8 s | 2.0 s | 10 ms | 0 |
| `/title/sintel` | desktop | 100 | 96 | 100 | 100 | 0.2 s | 0.4 s | 0 ms | 0 |
| `/search?q=animation` | mobile | 99 | 95 | 100 | 63 | 0.8 s | 2.1 s | 20 ms | 0 |
| `/search?q=animation` | desktop | 100 | 95 | 100 | 63 | 0.2 s | 0.4 s | 0 ms | 0 |

- Search scores 63 for SEO on purpose: search results are `noindex`.
- The remaining accessibility failure in that run was the footer's contrast. It has since been raised from `zinc-500` to `zinc-400`, but **not re-measured**.
- Back/forward cache is unavailable because every page is rendered dynamically with `no-store`.
- These are local numbers. They say nothing about a deployed site or real network conditions.

## Limits

- **Not on Supabase yet.** The schema is Supabase-compatible, but using it needs a hosted project, and the free org is at its limit. Moving would mean applying the migration, setting `DATABASE_URL`, and swapping `src/server/auth.ts` for Supabase Auth. Until then, auth is local email and password.
- **Progressive MP4 only.** No HLS/DASH, adaptive bitrate, transcoding, DRM or CDN. Videos play straight from their hosted URL, so playback depends on the Internet Archive.
- **Key art is generated.** Each title gets CSS artwork from its accent colour, with no poster upload or image pipeline.
- Single process locally (PGlite has one connection). Every page renders dynamically, with no caching layer.
- No kids or maturity filtering on profiles, no subtitles, and no recommendations beyond recency and genre rows.
