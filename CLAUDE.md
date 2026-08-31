# GigSync

Backend for an AI-powered gig-calendar auto-updater, aimed at musicians whose website gig
calendar has gone stale. Core mechanic: a musician forwards a gig-confirmation email to a
dedicated address; Claude extracts structured date/venue/time/address; the client's site
displays it via an embed. No login, no manual data entry, no middleman to email and pay.

**Status:** Deployed and verified live (2026-08-30) at `https://gigsync-backend.doug-rosenberg.workers.dev`
— real Claude API key (workspace-scoped, see Working conventions), real KV storage, `/extract`
and `/admin` both confirmed working against Cloudflare's actual infrastructure, not just
local `wrangler dev`. See "What's built" below.

This repo also doubles as one of two launch-demo artifacts for Doug's web-design business
(musician sites + SMB workflow apps): this is the **functional/AI-forward demo**; a separate
`guacamayo-band` Astro repo (different Claude session) is the **striking-UI demo**. Don't
duplicate UI work here — that repo owns it.

## Docs

- [`README.md`](./README.md) — the original product/business planning doc: problem
  statement, draft architecture, business-model options, validation plan.
- [`docs/WORKFLOW_DESIGN.md`](./docs/WORKFLOW_DESIGN.md) — the actual end-to-end workflow
  design and why it's shaped this way: email-forwarding as the sole client interface, the
  "never need the client's hosting access" constraint, cost breakdown, and the
  white-glove-now/self-serve-later go-to-market call.

## Source of truth for business strategy

Doug's broader freelance/consulting launch strategy (pricing, brand split, Sept 2026 launch
runbook) lives in the sibling `career-development` repo's `HAXBYTE_BRAND_PLAN.md`
(`../career-development/projects/HAXBYTE_BRAND_PLAN.md`), not here. This repo's own
business-model section in `README.md` is specific to this product idea; treat the brand plan
as authoritative for anything about the launch post, pricing tiers, or overall positioning.

## What's built

`src/index.ts` — a Cloudflare Worker:

- `POST /extract` — `{ text, clientId }` → forces a Claude tool-use call
  (`extract_gig_details`) → appends the structured result to that client's KV list → returns it.
- `GET /gigs?client=X` — returns the stored gig list for that tenant.
- Model defaults to `claude-haiku-4-5-20251001` (cheap; a single-message extraction doesn't
  need more). Bump the `MODEL` constant if real messages turn out messier than expected.
- CORS wide open (`*`) — fine for the demo, restrict to real client origins before this has
  non-demo clients.

`public/widget.js` + `public/widget.css` — the embeddable display side: a vanilla-JS,
framework-agnostic widget that fetches `GET /gigs?client=X` and renders an upcoming-shows
list. Drop-in usage is one mount `<div>` + one `<script>` tag with `data-api`/`data-client`
attributes — see `examples/embed.html` for the exact shape, and paste that same two-line
pattern into Astro, Squarespace's code-injection block, or anywhere else. Verified rendering
against real seeded KV data via a local browser test (2026-08-30).

`GET /admin` — a bare-bones dashboard, served by the Worker itself (no separate hosting,
no auth — same "the URL is the credential" pattern as everything else here). Lists every
client with data (via `GET /admin/clients`, which uses KV's prefix listing) and all of their
stored gigs in a table, including the address each client should forward gigs to
(`{clientId}@INBOUND_EMAIL_DOMAIN`). Verified rendering in a real browser against seeded KV
data (2026-08-30). Not paginated — fine at current scale, revisit if this ever needs to
handle more than KV's 1000-key single-page list limit.

`GET /` — a plain marketing-style landing page (three-step explanation, link to `/admin`),
served the same inline-HTML way as the admin page. Not the real business landing page —
just makes hitting the Worker's root not 404.

**Domain decision (2026-08-30):** the inbound email address shown in `/admin` uses
`gigs.haxbyte.com` (the `INBOUND_EMAIL_DOMAIN` constant) — a subdomain of the already-owned,
already-Cloudflare-managed `haxbyte.com`, chosen specifically to avoid buying a new domain
for testing. The **dashboard itself should not be hosted on haxbyte.com** — that domain is
deliberately kept as a neutral, cold-audience, recruiter-facing brand (see
`HAXBYTE_BRAND_PLAN.md`), and a live, zero-auth admin tool doesn't belong there even as a
subdomain. Using `gigs.haxbyte.com` purely as a mail-routing target (not a browsable page)
was judged low-exposure enough to be fine; hosting the actual dashboard there was not.

**Integration with `guacamayo-band`:** that repo's `src/data/shows.ts` fetches this Worker's
`GET /gigs` **at build time** (not client-side) via a top-level `await fetch`, with a 5-second
timeout and a fallback to placeholder data if the fetch fails — so its existing hand-styled
`Shows.astro` component needed zero changes, and a GigSync outage or pre-deploy state can't
break that site's build. The standalone `public/widget.js` client-side embed (below) was the
earlier, more generic proof-of-concept; the build-time fetch is the one actually wired into
the real site. Change is on that repo's `feature/gigsync-integration` branch, not yet merged.

**Fixed 2026-08-30 (found via live testing):** the extraction prompt now includes today's date so partial/relative dates ("Sat Oct 3," "next Friday") resolve to the correct upcoming occurrence instead of an arbitrary year — a real confirmation email with a year-less date sent the model to the wrong year (2025 instead of 2026) before this fix. Verified live: the exact same input resolved incorrectly before the fix and correctly after, redeployed to `gigsync-backend.doug-rosenberg.workers.dev`.

**`email()` handler (2026-08-30, on `feature/email-intake`):** the Worker now exports an
`email()` handler alongside `fetch()`, using `postal-mime` to parse the raw MIME message
Cloudflare Email Routing hands it. `clientId` is derived from the local part of the `to`
address (`guacamayo@gigs.haxbyte.com` → `guacamayo`); the parsed body text goes through the
same `storeGig()` helper `/extract` uses — refactored out specifically so both entry points
share one code path. Never throws (logs and drops instead) so a parse failure can't cause
Cloudflare to bounce or retry the message. Type-checked and the shared `storeGig` refactor
was regression-tested against the real Anthropic API locally.

**Email Routing configured and active (2026-08-30):** `gigs.haxbyte.com` added as a scoped
subdomain under `haxbyte.com`'s Cloudflare Email Routing (MX/TXT records added there — that
domain had zero prior email setup, so nothing existing was affected; its default catch-all
stays disabled). One routing rule: `guacamayo@gigs.haxbyte.com` → Worker `gigsync-backend`,
status Active. See `haxbyte`'s own `CLAUDE.md` for the cross-repo note left there, since this
lives in Cloudflare's dashboard config, not in either repo's code. **Still not verified
end-to-end** — no real email has been sent through it yet (DNS was still "Syncing"
immediately after setup), so the `email()` handler itself remains unproven until a real
message actually arrives and gets parsed correctly.

**Not yet built:** the confirmation-receipt auto-reply, and an edit/delete workflow (both
`/extract` and the admin dashboard are currently read/append-only).

**Also being explored, separately:** a from-scratch C# reimplementation of this same idea
(console app first, to validate the extraction logic in isolation — matching this repo's own
original "cheapest thing first" validation plan — before any web/hosting decision). Explicitly
a **separate repo/folder**, not a subfolder here — different toolchain entirely, and mixing
`wrangler`/Node with `dotnet` in one repo would make it unclear which one is authoritative.
Not started as of 2026-08-30; this TypeScript build stays the working, validated version
regardless of whether that exploration happens.

## Working conventions

- **Zero-dependency runtime, plain `fetch` to the Anthropic API** — no SDK. Keeps the Worker
  small and avoids bundling issues; also means the same pattern ports easily to any other
  runtime later.
- **The Anthropic API key must be workspace-scoped, not a default "same as linked account" personal key.** A personal key tied to an account with access to multiple workspaces (e.g. Default + the auto-created Claude Code workspace) requires an `anthropic-workspace-id` header on every request or it 400s. Creating the key with Scope set to a single workspace (e.g. "Default") avoids needing that header at all — this is what's actually deployed. Found live 2026-08-30.
- **No login/auth by design** — a `clientId` string is the only tenancy boundary. Don't add
  an account system without a real reason; it's a deliberate scope decision, not an oversight
  (see README.md's Draft Architecture section).
- **Prefer plain text over PDF input** unless a real case shows plain-text OCR isn't good
  enough — see `docs/WORKFLOW_DESIGN.md`'s "Input format" section for why, and the exact
  Claude API shape for native PDF/document input if that path is ever needed.
- Cloudflare Workers, not Azure, is the current host — matches Doug's existing Haxbyte stack
  and needs zero billing setup for a single-night MVP. Porting to Azure (per the original
  README's bootstrapping plan) is a real rewrite of the storage/hosting internals, not a
  config change — defer until an actual paying client justifies it.

## All changes go on a branch

**Don't commit directly to `main`.** Every change goes on a feature branch first (e.g.
`feature/admin-dashboard-and-landing`), matching the convention already established in the
`haxbyte` and `guacamayo-band` repos. Merge into `main` only when asked — this repo has a
real GitHub remote (`shalant/GigSync`), so `main` is treated as the deployable/reviewed
state, not a scratch branch.

## ⚠ No git commits during working hours

**Never run `git commit` (or `git push`) between 8:30am and 5:00pm Central Time,
Monday–Friday.** Same hard rule as the `haxbyte` and `guacamayo-band` repos — Doug's day job
runs those hours. Outside that window (evenings, early mornings, weekends) commits are fine.
If asked to commit during the blocked window, stage/prepare the change and say so instead of
committing anyway.
