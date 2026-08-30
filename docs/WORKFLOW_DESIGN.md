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

## Confirmation receipt (not yet built)

After a successful parse, auto-reply to the forwarded email: *"Got it — added [Venue] on [Date] to your calendar."* Cheap to add (any transactional email API's free tier covers this volume) and does double duty:

- Closes the loop so the client knows it worked without checking the site.
- Is the error-catch: a visibly wrong date/venue in the receipt gets caught immediately by the person who actually knows the gig details, instead of a fan showing up on the wrong night.

## Input format: prefer plain text over PDF/OCR

Claude's Messages API can take a PDF directly as a native `document` content block (no beta header, handles scanned/image-only PDFs via the same call, up to 32MB/600 pages) — so if a raw PDF/photo ever needs to go straight to Claude, that path exists and needs no separate OCR library or dependency (notably useful since Cloudflare Workers can't reliably run typical Node PDF-parsing libraries).

But the default assumption is plain text: if whatever capture step is in front of the Worker (a scanning app, a forwarded email body) can already produce text, send that — it's cheaper (a PDF page runs meaningfully more tokens than the same content as text, since it's processed like an image) and needs zero code beyond what already exists (`POST /extract { text }`). Only reach for the PDF/document path if a real case turns up where plain-text OCR quality isn't good enough.

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

## Go-to-market: white-glove now, self-serve later (deliberately deferred)

When this gets offered on a real landing/purchase page, don't offer a DIY "cheapest, embed-it-yourself" tier yet — **bundle it into the existing site-build offer and install it personally.**

Why: every current-stage client is already coming through a site build being done by hand. Installing this widget on a site already being built costs a couple of extra minutes, and it matches the trust-based pitch that's already working — a warm-referral, non-technical client wants to hand the problem to a trusted person and stop thinking about it, not receive a snippet and instructions. Building and supporting a true self-serve onboarding flow (generic cross-platform install docs, handling "I pasted it wrong," etc.) is real work that only pays off once there's demand from clients whose sites weren't built here — i.e. the standalone-SaaS path the README already flags as undecided and deferred. Don't build that path speculatively; build it if/when that demand actually shows up.
