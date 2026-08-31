# GigSync — Musician Gig-Calendar Automation

**Status:** MVP backend built and deployed live (2026-08-30) — core extraction/storage validated against real infrastructure. Still pre-validation on the actual product idea itself (no real client email tested yet) and pre-decision on business model. See "Built: MVP Backend" below for what's actually live.

## The Problem

Most musicians never keep their website's gig calendar up to date. Updating a calendar page is a chore that competes with actually playing music, so it just doesn't happen — even though a current calendar is one of the few things a band's website actually needs to do well.

## Core Concept

1. Client forwards/uploads a gig confirmation (email, or eventually a PDF/contract).
2. The confirmation is sent to the Claude API, which extracts structured gig data (date, venue, time, address) from the messy real-world text.
3. That structured data gets posted to the client's website automatically — no manual calendar editing.

**Stretch idea, explicitly out of scope for now:** auto-generating promo materials and social posts from the same uploaded info. Interesting later, not part of the MVP.

## Bootstrapping Plan

Existing Azure-hosted app/DB already exists. Azure SQL allows multiple databases under the same logical server for relatively cheap (serverless tier with auto-pause scales to near-$0 idle cost) — the idea is to add GigSync as a second database there, with the cost of a higher service tier funded by landing an actual paying client rather than paid for speculatively upfront.

## Built: MVP Backend (2026-08-30) — deployed and live

A working Cloudflare Worker implementing the endpoints below, built for a single-night launch-demo timeline (see Validation Plan). **Deployed and verified against real Cloudflare infrastructure and the real Claude API**, not just local `wrangler dev` — live at `https://gigsync-backend.doug-rosenberg.workers.dev`.

- `src/index.ts` — the Worker. `POST /extract` takes `{ text, clientId }`, forces a Claude tool-use call (`extract_gig_details`: date/time/venue/address/notes), appends the result to that client's KV list, returns the structured gig. `GET /gigs?client=X` returns the stored list for that tenant. `GET /admin` is a bare-bones dashboard over all clients' data; `GET /` is a plain landing page.
- Model defaults to `claude-haiku-4-5-20251001` (cheap; extraction from one message is not a hard task) — bump the `MODEL` constant to `claude-sonnet-5` if real messages turn out messier than expected.
- CORS is wide open (`*`) for the demo. Restrict to actual client site origins before this has real, non-demo clients.
- Zero-dependency at runtime — plain `fetch` to the Anthropic API, no SDK. Any frontend (Astro or otherwise) can call these JSON endpoints directly; nothing here is Astro-specific.
- **The extraction prompt anchors to today's real date** so a confirmation with a year-less date ("Sat Oct 3") resolves to the correct upcoming occurrence — found and fixed after live testing initially resolved one to the wrong year (2025 instead of 2026).

**Real validation done (2026-08-30):** posted realistic gig-confirmation text to the live `/extract` endpoint and checked the output against real Cloudflare infrastructure and the real Claude API — this is the actual product-risk check the Validation Plan below calls for, not just a code smoke test. Still worth running an actual Guacamayo gig-confirmation email through it once one exists, to validate against real-world message formatting rather than a written test case.

**Setup, for reference (already done for the current deploy):**
1. `npx wrangler login`.
2. `npx wrangler kv namespace create GIGS_KV` → paste the returned id into `wrangler.jsonc`.
3. `npx wrangler secret put ANTHROPIC_API_KEY` — **must be a workspace-scoped key** (Scope set to a single workspace, e.g. "Default"), not the default "same as linked account" personal key, or every request 400s asking for an `anthropic-workspace-id` header.
4. `npm run dev` to test locally, or `npm run deploy` to ship it to `*.workers.dev` for free.

## Draft Architecture (not yet built — subject to change once parsing is validated)

- **One shared, multi-tenant database**, not a database per client — a `client_id`/`tenant_id` column on each table. Simpler and cheaper than provisioning/migrating a new DB per client.
- **No login/auth system for MVP.** A unique per-client inbound email address (Azure Communication Services or a Logic App trigger on inbound mail) can hand the message body straight to the Claude API — avoids building and supporting a client-facing login/password-reset flow before there's any real usage to justify it.
- **Delivery to client sites: a platform-agnostic embeddable widget** (JS snippet or iframe) pointing at an endpoint on the hosted app, rather than a custom integration per client's site/CMS (Squarespace's API doesn't give clean calendar-write access, and clients may be on different platforms).
- **Claude API** used for structured extraction (JSON/tool-use style output: date, venue, time, address) from freeform email text.

## Business Model — Not Yet Decided

Two different paths, and they lead to different builds:

1. **Standalone self-serve SaaS** — ~$20/year, extremely low-friction checkout. Math check: after Stripe's cut (~4.4% on a $20 charge) and Claude API cost per parse, net is roughly $18-19/client/year. Reaching even $5-10k/year needs 300-600+ paying subscribers, which requires a real acquisition motion (SEO/ads/some viral loop) — a fundamentally different kind of business than the warm-referral, ~10hrs/week consulting model everything else in the broader plan is built around.
2. **Bundled feature / retention hook** on top of the existing $1,200-2,000 website-build offer (dougrosenbergdev.com / Haxbyte productized-services tier) — e.g. "I'll keep your gig calendar auto-updating for you" as a differentiator, or a cheap add-on after the initial build. Rides on leads already being generated for the site-build business; no separate acquisition funnel needed. Fits the existing pattern of sequencing upsells *after* trust (see `HAXBYTE_BRAND_PLAN.md`).

**Leaning:** undecided — worth a deliberate choice before building any checkout flow, not a default drift into option 1 just because $20/yr was the number that came up first.

**If standalone (option 1):** checkout itself is the easy part — Stripe Payment Links / Stripe Checkout gives a hosted, no-code recurring-payment page in ~10 minutes; a webhook on successful payment auto-provisions the client's account. Not the hard part of this idea.

## Validation Plan (cheapest thing first)

1. **Zero-infra test:** grab 2-3 real gig-confirmation emails (starting with ones from Guacamayo's leader) and run them through the Claude API with a JSON-extraction prompt. Check how reliably it handles messy, real-world formatting. This is the riskiest and most novel part of the idea — prove it out before spending anything on infrastructure.
2. Only after parsing holds up **and** there's a real interested client: build the minimal path (shared DB schema, inbound-email trigger, embeddable widget).
3. Defer indefinitely: full multi-tenant admin UI, PDF-to-promo-material/social-auto-post feature.

Consistent with the standing "don't build client-facing tooling before there's a real paying client" guardrail already applied elsewhere in the broader plan.

## Demo / First Test Case

**Guacamayo** (local band, reachable through their "leader") is the planned first real-world test case — both for validating the parsing pipeline against actual gig emails, and as a candidate first conversation about the idea itself.

Kept as a **separate repo** from this one: the `Guacamayo` folder holds the band's actual Astro site (a UI-development portfolio piece), while this repo (`GigSync`) holds the backend/business-idea code. Same logic as the Haxbyte/dougrosenbergdev.com split — a public-facing portfolio demo shouldn't live in the same repo as an unvalidated, potentially monetizable product idea. Keep this repo private (or at least unpublished) until the idea is further validated.

## Open Questions

- Standalone SaaS vs. bundled feature (see Business Model above) — not decided.
- What does "upload an email" concretely mean in the first real build — forwarding, pasting text, or a screenshot/PDF (which would need OCR/vision, not just text extraction)?
- Is there a specific musician client in mind yet, or is this still speculative pending how September outreach goes?
- Which existing Azure app/DB would this sit alongside, specifically?

---
*Last updated: 2026-08-30*
