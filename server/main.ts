// Avvio self-hosted (es. server Ubuntu in ufficio): HTTP con Node.js e database SQLite su file.
//
// Variabili d'ambiente:
//   PORTA            porta HTTP (predefinita 8787)
//   INDIRIZZO        interfaccia di ascolto (predefinita 0.0.0.0)
//   DATI             cartella per database e backup (predefinita ./dati)
//   ORA_CONTROLLI    ora dei controlli serali, ora italiana HH:MM (predefinita 23:30)
//   BACKUP_GIORNI    quanti backup giornalieri conservare (predefinito 30)
//   PROXY_HTTPS      "1" se davanti c'è un reverse proxy HTTPS che imposta X-Forwarded-Proto

import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eseguiControlliGiornalieri } from "../src/automazione";
import { oraLocale } from "../src/date";
import worker from "../src/index";
import { D1Sqlite } from "./d1-sqlite";

const PORTA = Number(process.env.PORTA ?? 8787);
const INDIRIZZO = process.env.INDIRIZZO ?? "0.0.0.0";
const DATI = resolve(process.env.DATI ?? "dati");
const ORA_CONTROLLI = process.env.ORA_CONTROLLI ?? "23:30";
const BACKUP_GIORNI = Number(process.env.BACKUP_GIORNI ?? 30);
const PROXY_HTTPS = process.env.PROXY_HTTPS === "1";
const MIGRAZIONI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

mkdirSync(join(DATI, "backup"), { recursive: true });
const d1 = new D1Sqlite(join(DATI, "presenze.db"));
for (const m of d1.applicaMigrazioni(MIGRAZIONI)) console.log(`Migrazione applicata: ${m}`);
const env = { DB: d1 as unknown as D1Database } as Env;

async function versoRequest(req: IncomingMessage): Promise<Request> {
	const protocollo = PROXY_HTTPS && req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
	const url = `${protocollo}://${req.headers.host ?? "localhost"}${req.url ?? "/"}`;
	const headers = new Headers();
	for (const [k, v] of Object.entries(req.headers)) {
		if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
		else if (v !== undefined) headers.set(k, v);
	}
	const chunks: Buffer[] = [];
	let dimensione = 0;
	for await (const c of req) {
		dimensione += c.length;
		if (dimensione > 1_000_000) throw new Error("Corpo della richiesta troppo grande");
		chunks.push(c);
	}
	const conCorpo = req.method !== "GET" && req.method !== "HEAD" && chunks.length > 0;
	return new Request(url, { method: req.method, headers, body: conCorpo ? Buffer.concat(chunks) : undefined });
}

const server = createServer(async (req, res) => {
	try {
		// Il Worker si aspetta una Request di Cloudflare: le proprietà `cf` qui non esistono e non vengono usate.
		const risposta = await worker.fetch((await versoRequest(req)) as Parameters<typeof worker.fetch>[0], env);
		const intestazioni: Record<string, string | string[]> = {};
		risposta.headers.forEach((v, k) => (intestazioni[k] = v));
		const cookie = risposta.headers.getSetCookie();
		if (cookie.length) intestazioni["set-cookie"] = cookie;
		res.writeHead(risposta.status, intestazioni);
		res.end(Buffer.from(await risposta.arrayBuffer()));
	} catch (e) {
		console.error(e);
		if (!res.headersSent) res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
		res.end("Richiesta non valida");
	}
});

function backup(data: string) {
	const cartella = join(DATI, "backup");
	const file = join(cartella, `presenze-${data}.db`);
	rmSync(file, { force: true });
	d1.db.prepare("VACUUM INTO ?").run(file);
	const vecchi = readdirSync(cartella).filter((f) => /^presenze-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -BACKUP_GIORNI);
	for (const f of vecchi) rmSync(join(cartella, f));
	console.log(`Backup creato: ${file}`);
}

// Controlli serali e backup, una volta al giorno all'ora indicata (ora italiana).
let ultimaEsecuzione = "";
setInterval(async () => {
	const { data, ora } = oraLocale();
	if (ora < ORA_CONTROLLI || ultimaEsecuzione === data) return;
	ultimaEsecuzione = data;
	try {
		await eseguiControlliGiornalieri(env.DB);
		backup(data);
	} catch (e) {
		console.error("Controlli serali non riusciti", e);
	}
}, 30_000).unref();

server.listen(PORTA, INDIRIZZO, () => {
	console.log(`Registro presenze in ascolto su http://${INDIRIZZO}:${PORTA} (dati in ${DATI}, controlli alle ${ORA_CONTROLLI})`);
});

for (const segnale of ["SIGINT", "SIGTERM"] as const) {
	process.on(segnale, () => {
		server.close();
		d1.db.close();
		process.exit(0);
	});
}
