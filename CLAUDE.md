# GigSync

Backend for an AI-powered gig-calendar auto-updater, aimed at musicians whose website gig
calendar has gone stale. Core mechanic: a musician forwards a gig-confirmation email to a
dedicated address; Claude extracts structured date/venue/time/address; the client's site
displays it via an embed. No login, no manual data entry, no middleman to email and pay.

**Status:** MVP backend built and smoke-tested locally (2026-08-30) — not yet deployed. See
"What's built" below.

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

**Not yet built:** email-routing intake (Cloudflare Email Routing → this Worker), the
confirmation-receipt auto-reply, and actual deployment (needs a KV namespace created and the
`ANTHROPIC_API_KEY` secret set — see README.md's "Built: MVP Backend" section for the exact
commands).

## Working conventions

- **Zero-dependency runtime, plain `fetch` to the Anthropic API** — no SDK. Keeps the Worker
  small and avoids bundling issues; also means the same pattern ports easily to any other
  runtime later.
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

## ⚠ No git commits during working hours

**Never run `git commit` (or `git push`) between 8:30am and 5:00pm Central Time,
Monday–Friday.** Same hard rule as the `haxbyte` and `guacamayo-band` repos — Doug's day job
runs those hours. Outside that window (evenings, early mornings, weekends) commits are fine.
If asked to commit during the blocked window, stage/prepare the change and say so instead of
committing anyway.
