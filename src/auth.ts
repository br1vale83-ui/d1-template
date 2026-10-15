import { HttpError, leggiCookie } from "./http";

export const COOKIE_SESSIONE = "presenze_sessione";
const DURATA_SESSIONE_ORE = 12;
const ITERAZIONI_PBKDF2 = 100_000;

export interface Utente {
	id: number;
	matricola: string;
	nome: string;
	cognome: string;
	ruolo: "admin" | "dipendente";
	ore_giornaliere: number;
	giorni_ferie_annui: number;
}

const hex = (buf: ArrayBuffer | Uint8Array) =>
	[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

function daHex(s: string): Uint8Array {
	const out = new Uint8Array(s.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
	return out;
}

async function pbkdf2(pin: string, salt: Uint8Array): Promise<string> {
	const chiave = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERAZIONI_PBKDF2 },
		chiave,
		256,
	);
	return hex(bits);
}

export function validaPin(pin: unknown): string {
	if (typeof pin !== "string" || !/^\d{4,12}$/.test(pin)) {
		throw new HttpError(400, "Il PIN deve contenere da 4 a 12 cifre");
	}
	return pin;
}

export async function hashPin(pin: string): Promise<{ pin_hash: string; pin_salt: string }> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	return { pin_hash: await pbkdf2(pin, salt), pin_salt: hex(salt) };
}

export async function verificaPin(pin: string, hash: string, salt: string): Promise<boolean> {
	const calcolato = await pbkdf2(pin, daHex(salt));
	if (calcolato.length !== hash.length) return false;
	let diff = 0;
	for (let i = 0; i < hash.length; i++) diff |= calcolato.charCodeAt(i) ^ hash.charCodeAt(i);
	return diff === 0;
}

async function sha256(s: string): Promise<string> {
	return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

export async function creaSessione(db: D1Database, dipendenteId: number): Promise<string> {
	const token = hex(crypto.getRandomValues(new Uint8Array(32)));
	const scadenza = new Date(Date.now() + DURATA_SESSIONE_ORE * 3600_000).toISOString();
	await db
		.prepare("INSERT INTO sessioni (token_hash, dipendente_id, scadenza) VALUES (?, ?, ?)")
		.bind(await sha256(token), dipendenteId, scadenza)
		.run();
	return `${COOKIE_SESSIONE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DURATA_SESSIONE_ORE * 3600}`;
}

export async function chiudiSessione(db: D1Database, req: Request): Promise<string> {
	const token = leggiCookie(req, COOKIE_SESSIONE);
	if (token) await db.prepare("DELETE FROM sessioni WHERE token_hash = ?").bind(await sha256(token)).run();
	return `${COOKIE_SESSIONE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function utenteCorrente(db: D1Database, req: Request): Promise<Utente | null> {
	const token = leggiCookie(req, COOKIE_SESSIONE);
	if (!token) return null;
	return db
		.prepare(
			`SELECT d.id, d.matricola, d.nome, d.cognome, d.ruolo, d.ore_giornaliere, d.giorni_ferie_annui
			 FROM sessioni s JOIN dipendenti d ON d.id = s.dipendente_id
			 WHERE s.token_hash = ? AND s.scadenza > ? AND d.attivo = 1`,
		)
		.bind(await sha256(token), new Date().toISOString())
		.first<Utente>();
}
