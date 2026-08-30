export interface Env {
	ANTHROPIC_API_KEY: string;
	GIGS_KV: KVNamespace;
}

// Cheap default: extraction from a single confirmation message is a simple
// enough task that Haiku handles it reliably at a fraction of Sonnet's cost.
// Bump to "claude-sonnet-5" if real-world messages turn out messier than expected.
const MODEL = "claude-haiku-4-5-20251001";

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

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "OPTIONS") {
			return new Response(null, { headers: CORS_HEADERS });
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

		return json({ error: "Not found" }, 404);
	},
};
