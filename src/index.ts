const QUESTIONS_PER_LEVEL = 5;

// Composizione di ogni livello: la difficoltà (tier 1-5) di ciascuna delle 5 domande.
// Dal livello 9 in poi tutte le domande sono di difficoltà massima.
const LEVEL_PLAN: number[][] = [
	[1, 1, 1, 1, 1],
	[1, 1, 2, 2, 2],
	[2, 2, 2, 2, 3],
	[2, 3, 3, 3, 3],
	[3, 3, 3, 4, 4],
	[3, 4, 4, 4, 4],
	[4, 4, 4, 5, 5],
	[4, 5, 5, 5, 5],
];
const LAST_PLAN = [5, 5, 5, 5, 5];

type CountryRow = {
	id: number;
	name: string;
	capital: string;
	aliases: string;
	tier: number;
	continent: string;
};

const COLUMNS = "id, name, capital, aliases, tier, continent";

function json(data: unknown, status = 200) {
	return Response.json(data, { status });
}

function parseIds(raw: string | null): number[] {
	if (!raw) return [];
	return raw
		.split(",")
		.map((s) => Number.parseInt(s, 10))
		.filter((n) => Number.isInteger(n) && n > 0)
		.slice(0, 1000);
}

async function getLevel(url: URL, env: Env) {
	const level = Number.parseInt(url.searchParams.get("n") ?? "1", 10);
	if (!Number.isInteger(level) || level < 1 || level > 1000) {
		return json({ error: "Livello non valido" }, 400);
	}
	const exclude = parseIds(url.searchParams.get("exclude"));
	const plan = LEVEL_PLAN[level - 1] ?? LAST_PLAN;

	const perTier = new Map<number, number>();
	for (const tier of plan) perTier.set(tier, (perTier.get(tier) ?? 0) + 1);

	const results = await env.DB.batch<CountryRow>(
		[...perTier].map(([tier, count]) =>
			env.DB.prepare(
				`SELECT ${COLUMNS} FROM countries
				 WHERE tier = ?1 AND id NOT IN (SELECT value FROM json_each(?2))
				 ORDER BY RANDOM() LIMIT ?3`,
			).bind(tier, JSON.stringify(exclude), count),
		),
	);
	const picked = results.flatMap((r) => r.results);

	// Se una fascia è esaurita, completa con gli Stati rimasti di difficoltà più vicina.
	if (picked.length < QUESTIONS_PER_LEVEL) {
		const used = [...exclude, ...picked.map((c) => c.id)];
		const { results: extra } = await env.DB.prepare(
			`SELECT ${COLUMNS} FROM countries
			 WHERE id NOT IN (SELECT value FROM json_each(?1))
			 ORDER BY ABS(tier - ?2), RANDOM() LIMIT ?3`,
		)
			.bind(JSON.stringify(used), Math.max(...plan), QUESTIONS_PER_LEVEL - picked.length)
			.all<CountryRow>();
		picked.push(...extra);
	}

	picked.sort((a, b) => a.tier - b.tier);
	return json({
		level,
		countries: picked.map((c) => ({
			...c,
			aliases: c.aliases ? c.aliases.split("|") : [],
		})),
	});
}

async function getScores(env: Env) {
	const { results } = await env.DB.prepare(
		"SELECT player, score, level, correct, created_at FROM scores ORDER BY score DESC, created_at ASC LIMIT 10",
	).all();
	return json({ scores: results });
}

async function postScore(request: Request, env: Env) {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ error: "JSON non valido" }, 400);
	}
	const player = typeof body.player === "string" ? body.player.trim().slice(0, 20) : "";
	const score = Number(body.score);
	const level = Number(body.level);
	const correct = Number(body.correct);
	if (
		!player ||
		!Number.isInteger(score) || score < 0 || score > 100_000 ||
		!Number.isInteger(level) || level < 1 || level > 1000 ||
		!Number.isInteger(correct) || correct < 0 || correct > 5000
	) {
		return json({ error: "Dati non validi" }, 400);
	}
	await env.DB.prepare("INSERT INTO scores (player, score, level, correct) VALUES (?1, ?2, ?3, ?4)")
		.bind(player, score, level, correct)
		.run();
	return getScores(env);
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const route = `${request.method} ${url.pathname}`;

		switch (route) {
			case "GET /api/level":
				return getLevel(url, env);
			case "GET /api/scores":
				return getScores(env);
			case "POST /api/scores":
				return postScore(request, env);
		}
		if (url.pathname.startsWith("/api/")) {
			return json({ error: "Not found" }, 404);
		}
		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
