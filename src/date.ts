// Utility per date "di calendario" (YYYY-MM-DD) e fuso orario Europe/Rome.

export const FUSO = "Europe/Rome";

const formatter = new Intl.DateTimeFormat("en-CA", {
	timeZone: FUSO,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
});

/** Data e ora locali italiane di un istante. */
export function oraLocale(istante: Date = new Date()): { data: string; ora: string } {
	const p = Object.fromEntries(formatter.formatToParts(istante).map((x) => [x.type, x.value]));
	return { data: `${p.year}-${p.month}-${p.day}`, ora: `${p.hour}:${p.minute}` };
}

export function isData(s: unknown): s is string {
	if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const d = new Date(`${s}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isOra(s: unknown): s is string {
	return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function aggiungiGiorni(data: string, n: number): string {
	const d = new Date(`${data}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

export function giorniTra(dal: string, al: string): string[] {
	const out: string[] = [];
	for (let d = dal; d <= al; d = aggiungiGiorni(d, 1)) out.push(d);
	return out;
}

/** 0 = domenica ... 6 = sabato */
export function giornoSettimana(data: string): number {
	return new Date(`${data}T00:00:00Z`).getUTCDay();
}

export function ultimoGiornoMese(mese: string): string {
	const [a, m] = mese.split("-").map(Number);
	return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

/** Domenica di Pasqua (algoritmo gregoriano anonimo). */
export function pasqua(anno: number): string {
	const a = anno % 19;
	const b = Math.floor(anno / 100);
	const c = anno % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const mese = Math.floor((h + l - 7 * m + 114) / 31);
	const giorno = ((h + l - 7 * m + 114) % 31) + 1;
	return `${anno}-${String(mese).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`;
}

/** Festività nazionali italiane dell'anno. */
export function festivitaNazionali(anno: number): Map<string, string> {
	const f = new Map<string, string>([
		[`${anno}-01-01`, "Capodanno"],
		[`${anno}-01-06`, "Epifania"],
		[`${anno}-04-25`, "Festa della Liberazione"],
		[`${anno}-05-01`, "Festa del Lavoro"],
		[`${anno}-06-02`, "Festa della Repubblica"],
		[`${anno}-08-15`, "Ferragosto"],
		[`${anno}-11-01`, "Ognissanti"],
		[`${anno}-12-08`, "Immacolata Concezione"],
		[`${anno}-12-25`, "Natale"],
		[`${anno}-12-26`, "Santo Stefano"],
	]);
	const p = pasqua(anno);
	f.set(p, "Pasqua");
	f.set(aggiungiGiorni(p, 1), "Lunedì dell'Angelo");
	// San Francesco d'Assisi, festività nazionale dal 2026 (L. 151/2025).
	if (anno >= 2026) f.set(`${anno}-10-04`, "San Francesco d'Assisi");
	return f;
}
