# Workflow Design (2026-08-30)

Captures the product/workflow reasoning from the session that also produced the MVP backend (`src/index.ts`) — why the workflow is shaped the way it is, not just what the code does.

## The actual problem

Roughly 80% of musicians have an abandoned gig calendar on their website. Not because they don't care, but because every existing path to updating it has real friction:

- They forgot their own website login.
- Updating it means emailing (and often paying) someone else to do it.
- Even when they can log in themselves, manually typing date/venue/time/address into a CMS is a chore that loses to "I'll do it later."

Any fix that still requires a login, a manual form, or a middleman doesn't actually solve this — it just relocates the friction.

## The workflow: email forwarding as the only interface

**The client's entire interaction with the product is: forward the gig-confirmation email they already got.** No login, no app, no dashboard, no bookmark to remember.

- Each client gets one dedicated inbound address. They forward a booking confirmation to it the same way they'd forward any email — an action they already do reflexively, not a new habit to build.
- Cloudflare Email Routing receives the mail and hands it to the `/extract` Worker endpoint, which calls Claude (tool-use extraction of date/time/venue/address/notes) and stores the structured result in KV.
- The client's site displays the result via an embeddable widget (`GET /gigs?client=X`) — no manual re-entry anywhere in the loop.

This directly answers all three friction points above: nothing to log into, nobody to email-and-pay, nothing to manually type.

## Design principle: never need the client's hosting access

Two choices specifically avoid ever needing login/DNS/hosting credentials from the client — worth preserving as a constraint on future changes, not just an incidental outcome:

1. **Display side:** ship a `<script>`/`<iframe>` embed snippet the client (or their site builder's code-injection block) pastes in themselves. Never touch their CMS or hosting directly.
2. **Intake side:** inbound addresses live on a subdomain of **our own domain** (e.g. `guacamayo@gigs.<ourdomain>`), not the client's domain. Using the client's own domain would require adding MX/DNS records on their side — real hosting-adjacent friction we don't need to ask for.

"You never need to give me your hosting login" is a real trust/differentiation point for the pitch, not just an implementation detail.

**Decided (2026-08-30):** for testing, that "own domain" is `haxbyte.com` (already ours, already on Cloudflare — no new domain purchase needed), used as `gigs.haxbyte.com`. Important distinction that came up while deciding this: using it purely as a **mail-routing target** is low-exposure (nobody browses to it, it's not linked anywhere), but hosting the actual **admin dashboard** there would not be — `haxbyte.com` is deliberately kept as a neutral, cold-audience, recruiter-facing brand (see `HAXBYTE_BRAND_PLAN.md`), and a live, zero-auth internal tool doesn't belong on a domain a recruiter might actually visit. So: email subdomain there, dashboard stays on the Worker's own `*.workers.dev` URL (or wherever it's actually deployed).

**Live as of 2026-08-30:** the `gigs.haxbyte.com` subdomain, MX/TXT records, and a routing rule (`guacamayo@gigs.haxbyte.com` → the deployed Worker) are actually configured and Active in Cloudflare — not just decided. Not yet proven end-to-end, though: no real email has been sent through it, so the `email()` handler is deployed but unverified against real inbound mail.

## Confirmation receipt (not yet built)

After a successful parse, auto-reply to the forwarded email: *"Got it — added [Venue] on [Date] to your calendar."* Cheap to add (any transactional email API's free tier covers this volume) and does double duty:

- Closes the loop so the client knows it worked without checking the site.
- Is the error-catch: a visibly wrong date/venue in the receipt gets caught immediately by the person who actually knows the gig details, instead of a fan showing up on the wrong night.

## Input format: prefer plain text over PDF/OCR

Claude's Messages API can take a PDF directly as a native `document` content block (no beta header, handles scanned/image-only PDFs via the same call, up to 32MB/600 pages) — so if a raw PDF/photo ever needs to go straight to Claude, that path exists and needs no separate OCR library or dependency (notably useful since Cloudflare Workers can't reliably run typical Node PDF-parsing libraries).

But the default assumption is plain text: if whatever capture step is in front of the Worker (a scanning app, a forwarded email body) can already produce text, send that — it's cheaper (a PDF page runs meaningfully more tokens than the same content as text, since it's processed like an image) and needs zero code beyond what already exists (`POST /extract { text }`). Only reach for the PDF/document path if a real case turns up where plain-text OCR quality isn't good enough.

## Real bug found via live testing: dates need a "today" anchor

The "actual problem" section above names a wrong date on a real calendar as exactly the failure this exists to prevent — and live testing on 2026-08-30 turned up a real way that could happen: a confirmation with a year-less date ("Sat Oct 3") got resolved to 2025-10-03 (already in the past) instead of 2026-10-03, because the extraction prompt never told the model what today's actual date was. Fixed by anchoring the prompt to the real current date and instructing it to resolve partial dates to the next occurrence on or after today, never the past. Worth remembering as a class of bug, not just this one instance: anything that depends on "now" needs "now" passed in explicitly — the model has no other way to know.

## Cost to run

At current/early scale (a handful of clients, each forwarding maybe tens of gigs a month):

| Piece | Cost |
|---|---|
| Cloudflare Workers | Free tier (100k+ req/day) |
| Cloudflare KV | Free tier |
| Cloudflare Email Routing | Free |
| Claude API (Haiku 4.5) | ~$0.002 per gig parsed |
| Outbound receipt email | Free tier of any transactional provider |

Realistic total: **under $2/month**, scaling with actual parse volume rather than a fixed server cost.

## Security posture while testing (2026-08-30)

Deliberately **not** building real authentication yet — matches the standing "don't build client-facing tooling before there's a real, paying client" guardrail, and the admin dashboard's zero-auth, "the URL is the credential" design is fine for a private test. The one precaution that *does* apply even now, because it's free: don't publish or link the real deployed URL or the real inbound email address anywhere public. Right now obscurity is the only gate — worth not undermining it by broadcasting the link before there's an actual auth story.

## Go-to-market: white-glove now, self-serve later (deliberately deferred)

When this gets offered on a real landing/purchase page, don't offer a DIY "cheapest, embed-it-yourself" tier yet — **bundle it into the existing site-build offer and install it personally.**

Why: every current-stage client is already coming through a site build being done by hand. Installing this widget on a site already being built costs a couple of extra minutes, and it matches the trust-based pitch that's already working — a warm-referral, non-technical client wants to hand the problem to a trusted person and stop thinking about it, not receive a snippet and instructions. Building and supporting a true self-serve onboarding flow (generic cross-platform install docs, handling "I pasted it wrong," etc.) is real work that only pays off once there's demand from clients whose sites weren't built here — i.e. the standalone-SaaS path the README already flags as undecided and deferred. Don't build that path speculatively; build it if/when that demand actually shows up.
