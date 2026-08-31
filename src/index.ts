export interface Env {
	ANTHROPIC_API_KEY: string;
	GIGS_KV: KVNamespace;
}

// Cheap default: extraction from a single confirmation message is a simple
// enough task that Haiku handles it reliably at a fraction of Sonnet's cost.
// Bump to "claude-sonnet-5" if real-world messages turn out messier than expected.
const MODEL = "claude-haiku-4-5-20251001";

// Decided 2026-08-30: a subdomain of haxbyte.com (already ours, already on
// Cloudflare — no new domain purchase needed for testing). Cloudflare Email
// Routing itself isn't wired up yet (see docs/WORKFLOW_DESIGN.md); this
// constant is what the admin dashboard displays as each client's forwarding
// address ahead of that. Each client's inbound address is just clientId@
// this domain.
const INBOUND_EMAIL_DOMAIN = "gigs.haxbyte.com";

const CORS_HEADERS = {
	// Demo-only. Once this has real clients, restrict to their actual site origin(s).
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json", ...CORS_HEADERS },
	});
}

const EXTRACT_TOOL = {
	name: "extract_gig_details",
	description:
		"Extract structured gig-booking details from a freeform confirmation message (email, text, or DM).",
	input_schema: {
		type: "object",
		properties: {
			date: {
				type: "string",
				description: "Gig date as ISO 8601 (YYYY-MM-DD) if determinable, else empty string.",
			},
			time: {
				type: "string",
				description: "Start time as stated (e.g. '8:00 PM'), else empty string.",
			},
			venue: {
				type: "string",
				description: "Venue or business name.",
			},
			address: {
				type: "string",
				description: "Street address or location, else empty string.",
			},
			notes: {
				type: "string",
				description: "Anything else relevant: pay, load-in time, contact, set length, dress code, etc.",
			},
		},
		required: ["date", "time", "venue", "address", "notes"],
	},
} as const;

interface ExtractedGig {
	date: string;
	time: string;
	venue: string;
	address: string;
	notes: string;
}

async function extractGigDetails(text: string, apiKey: string): Promise<ExtractedGig> {
	const res = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model: MODEL,
			max_tokens: 1024,
			tools: [EXTRACT_TOOL],
			tool_choice: { type: "tool", name: "extract_gig_details" },
			messages: [
				{
					role: "user",
					content: `Extract the gig booking details from this message. If a field isn't stated, use an empty string rather than guessing.\n\n---\n${text}\n---`,
				},
			],
		}),
	});

	if (!res.ok) {
		throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
	}

	const data = (await res.json()) as {
		content: Array<{ type: string; input?: ExtractedGig }>;
	};
	const toolUse = data.content.find((block) => block.type === "tool_use");
	if (!toolUse?.input) throw new Error("Model did not return structured output");
	return toolUse.input;
}

const LANDING_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>GigSync</title>
<style>
	:root { --ink: #0b1220; --paper: #fafafa; --accent: #2dd4bf; --muted: #6b7280; }
	* { box-sizing: border-box; }
	body { font-family: system-ui, -apple-system, sans-serif; margin: 0; background: var(--paper); color: var(--ink); }
	.hero { max-width: 640px; margin: 0 auto; padding: 4.5rem 1.5rem 3rem; text-align: center; }
	.eyebrow {
		display: inline-block; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em;
		text-transform: uppercase; color: var(--accent); background: rgba(45, 212, 191, 0.12);
		padding: 0.3rem 0.8rem; border-radius: 999px; margin-bottom: 1.25rem;
	}
	h1 { font-size: clamp(2rem, 5vw, 2.75rem); margin: 0 0 1rem; line-height: 1.15; }
	.lede { font-size: 1.1rem; color: var(--muted); line-height: 1.6; margin: 0 auto 2.5rem; max-width: 480px; }
	.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; max-width: 640px; margin: 0 auto 3rem; text-align: left; }
	.step { background: #fff; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1.25rem; }
	.step-num {
		display: inline-flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem;
		border-radius: 50%; background: var(--ink); color: var(--accent); font-weight: 700; font-size: 0.85rem; margin-bottom: 0.6rem;
	}
	.step h3 { font-size: 0.95rem; margin: 0 0 0.35rem; }
	.step p { font-size: 0.85rem; color: var(--muted); margin: 0; line-height: 1.5; }
	.cta {
		display: inline-block; padding: 0.75rem 1.5rem; background: var(--ink); color: var(--accent);
		text-decoration: none; border-radius: 0.5rem; font-weight: 600; font-size: 0.95rem;
	}
	.cta:hover { opacity: 0.9; }
	@media (max-width: 560px) { .steps { grid-template-columns: 1fr; } }
</style>
</head>
<body>
	<div class="hero">
		<span class="eyebrow">GigSync</span>
		<h1>Your gig calendar, without the busywork</h1>
		<p class="lede">
			Forward the booking confirmation you already got. GigSync reads it and
			updates your website's show calendar automatically — no login to
			remember, nothing to type in by hand, nobody to email and pay.
		</p>
		<div class="steps">
			<div class="step">
				<span class="step-num">1</span>
				<h3>Forward it</h3>
				<p>Send the gig confirmation you already received to your dedicated address.</p>
			</div>
			<div class="step">
				<span class="step-num">2</span>
				<h3>It's read automatically</h3>
				<p>Claude pulls the date, venue, time, and address out of the messy real-world text.</p>
			</div>
			<div class="step">
				<span class="step-num">3</span>
				<h3>Your site updates</h3>
				<p>The show appears on your calendar — no manual entry, no waiting on anyone.</p>
			</div>
		</div>
		<nav><a class="cta" href="/admin">View Admin →</a></nav>
	</div>
</body>
</html>`;

const ADMIN_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>GigSync — Admin</title>
<style>
	body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #0b1220; }
	h1 { font-size: 1.25rem; }
	table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; }
	th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; vertical-align: top; }
	th { color: #6b7280; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }
	.client-heading { margin-top: 2rem; font-weight: 600; }
	.client-email { margin: 0.15rem 0 0; font-size: 0.85rem; color: #6b7280; }
	.client-email code { background: #f3f4f6; padding: 0.1rem 0.4rem; border-radius: 0.25rem; }
	.empty, .loading { color: #6b7280; font-style: italic; }
	.error { color: #b91c1c; }
</style>
</head>
<body>
<h1>GigSync — All Clients</h1>
<div id="app" class="loading">Loading…</div>
<script>
(function () {
	var app = document.getElementById("app");
	var INBOUND_EMAIL_DOMAIN = "${INBOUND_EMAIL_DOMAIN}";

	function el(tag, className, children) {
		var e = document.createElement(tag);
		if (className) e.className = className;
		(children || []).forEach(function (c) {
			e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
		});
		return e;
	}

	fetch("/admin/clients")
		.then(function (r) { return r.json(); })
		.then(function (data) {
			app.innerHTML = "";
			app.className = "";
			var clients = data.clients || [];
			if (!clients.length) {
				app.appendChild(el("p", "empty", ["No client data yet."]));
				return;
			}
			return Promise.all(
				clients.map(function (clientId) {
					return fetch("/gigs?client=" + encodeURIComponent(clientId))
						.then(function (r) { return r.json(); })
						.then(function (d) { return { clientId: clientId, gigs: d.gigs || [] }; });
				})
			).then(function (results) {
				results.forEach(function (result) {
					var codeEl = el("code", null, [result.clientId + "@" + INBOUND_EMAIL_DOMAIN]);
					app.appendChild(el("h2", "client-heading", [result.clientId + " (" + result.gigs.length + ")"]));
					app.appendChild(el("p", "client-email", ["Forward gigs to: ", codeEl]));
					if (!result.gigs.length) {
						app.appendChild(el("p", "empty", ["No gigs stored."]));
						return;
					}
					var rows = result.gigs.map(function (gig) {
						return el("tr", null, [
							el("td", null, [gig.date || ""]),
							el("td", null, [gig.time || ""]),
							el("td", null, [gig.venue || ""]),
							el("td", null, [gig.address || ""]),
							el("td", null, [gig.notes || ""]),
							el("td", null, [gig.createdAt ? new Date(gig.createdAt).toLocaleString() : ""]),
						]);
					});
					var headerRow = el("tr", null, ["Date", "Time", "Venue", "Address", "Notes", "Added"].map(function (h) {
						return el("th", null, [h]);
					}));
					app.appendChild(el("table", null, [el("thead", null, [headerRow]), el("tbody", null, rows)]));
				});
			});
		})
		.catch(function (err) {
			app.innerHTML = "";
			app.className = "error";
			app.textContent = "Failed to load: " + err.message;
		});
})();
</script>
</body>
</html>`;

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "OPTIONS") {
			return new Response(null, { headers: CORS_HEADERS });
		}

		if (url.pathname === "/" && request.method === "GET") {
			return new Response(LANDING_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
		}

		if (url.pathname === "/extract" && request.method === "POST") {
			let body: { text?: string; clientId?: string };
			try {
				body = await request.json();
			} catch {
				return json({ error: "Invalid JSON body" }, 400);
			}

			if (!body.text || typeof body.text !== "string") {
				return json({ error: "Missing required 'text' field" }, 400);
			}

			const clientId = body.clientId || "demo";

			try {
				const extracted = await extractGigDetails(body.text, env.ANTHROPIC_API_KEY);
				const gig = {
					id: crypto.randomUUID(),
					clientId,
					...extracted,
					createdAt: new Date().toISOString(),
				};

				const key = `gigs:${clientId}`;
				const existing = (await env.GIGS_KV.get(key, "json")) as unknown[] | null;
				const gigs = existing ? [...existing, gig] : [gig];
				await env.GIGS_KV.put(key, JSON.stringify(gigs));

				return json({ gig });
			} catch (err) {
				return json({ error: (err as Error).message }, 502);
			}
		}

		if (url.pathname === "/gigs" && request.method === "GET") {
			const clientId = url.searchParams.get("client") || "demo";
			const gigs = (await env.GIGS_KV.get(`gigs:${clientId}`, "json")) ?? [];
			return json({ gigs });
		}

		if (url.pathname === "/admin" && request.method === "GET") {
			return new Response(ADMIN_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
		}

		if (url.pathname === "/admin/clients" && request.method === "GET") {
			// Fine for a handful of clients; add cursor-based pagination here if this
			// ever needs to scale past KV's single-page list limit (1000 keys).
			const list = await env.GIGS_KV.list({ prefix: "gigs:" });
			const clients = list.keys.map((k) => k.name.slice("gigs:".length));
			return json({ clients });
		}

		return json({ error: "Not found" }, 404);
	},
};
