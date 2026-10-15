import {
	chiudiSessione,
	creaSessione,
	hashPin,
	utenteCorrente,
	validaPin,
	verificaPin,
	type Utente,
} from "./auth";
import { controllaGiornata } from "./automazione";
import {
	assenzaValida,
	calcolaGiorni,
	calcolaSaldoFerie,
	giorniFerieRichiesta,
	riepiloga,
	type Assenza,
	type TipoAssenza,
} from "./calendario";
import { aggiungiGiorni, giorniTra, isData, isOra, oraLocale, ultimoGiornoMese } from "./date";
import { caricaAssenze, caricaChiusure, caricaTimbrature, registra, risolviAnomalieCoperte } from "./dati";
import { HttpError, json, leggiJson, numero, testo } from "./http";

type Ctx = { req: Request; env: Env; url: URL; utente: Utente | null; params: string[] };
type Handler = (ctx: Ctx) => Promise<Response>;

const MAX_TENTATIVI = 5;
const BLOCCO_MINUTI = 15;
const TIPI_ASSENZA: TipoAssenza[] = ["ferie", "permesso", "malattia", "infortunio"];
// Tipi che non possono sovrapporsi tra loro. La malattia può invece cadere durante le ferie (le sospende).
const GRUPPI_INCOMPATIBILI: Record<TipoAssenza, TipoAssenza[]> = {
	ferie: ["ferie", "permesso", "malattia", "infortunio"],
	permesso: ["ferie", "permesso", "malattia", "infortunio"],
	malattia: ["malattia", "infortunio"],
	infortunio: ["malattia", "infortunio"],
};

function richiediUtente(ctx: Ctx): Utente {
	if (!ctx.utente) throw new HttpError(401, "Accesso richiesto");
	return ctx.utente;
}

function richiediAdmin(ctx: Ctx): Utente {
	const u = richiediUtente(ctx);
	if (u.ruolo !== "admin") throw new HttpError(403, "Operazione riservata agli amministratori");
	return u;
}

/** Gli amministratori possono operare su qualsiasi dipendente; gli altri solo su sé stessi. */
function dipendenteTarget(ctx: Ctx, richiesto: unknown): number {
	const u = richiediUtente(ctx);
	if (richiesto === undefined || richiesto === null || richiesto === "") return u.id;
	const id = Number(richiesto);
	if (!Number.isInteger(id)) throw new HttpError(400, "dipendente_id non valido");
	if (id !== u.id && u.ruolo !== "admin") throw new HttpError(403, "Non puoi accedere ai dati di altri dipendenti");
	return id;
}

async function dipendente(db: D1Database, id: number) {
	const d = await db
		.prepare("SELECT id, matricola, nome, cognome, ruolo, ore_giornaliere, giorni_ferie_annui, data_assunzione, attivo FROM dipendenti WHERE id = ?")
		.bind(id)
		.first<Utente & { attivo: number; data_assunzione: string }>();
	if (!d) throw new HttpError(404, "Dipendente non trovato");
	return d;
}

function mese(v: string | null): string {
	const m = v ?? oraLocale().data.slice(0, 7);
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw new HttpError(400, "Mese non valido (formato AAAA-MM)");
	return m;
}

function data(v: unknown, campo: string): string {
	if (!isData(v)) throw new HttpError(400, `Data non valida: ${campo} (formato AAAA-MM-GG)`);
	return v;
}

async function saldoFerie(db: D1Database, dip: Pick<Utente, "id" | "giorni_ferie_annui">, anno: number) {
	const dal = `${anno}-01-01`;
	const al = `${anno}-12-31`;
	return calcolaSaldoFerie({
		anno,
		oggi: oraLocale().data,
		spettanti: dip.giorni_ferie_annui,
		assenze: await caricaAssenze(db, dip.id, dal, al),
		chiusure: await caricaChiusure(db, dal, al),
	});
}

/** Verifica che le ferie richieste rientrino nel saldo di ciascun anno coinvolto. */
async function verificaSaldo(db: D1Database, dip: Utente, richiesta: Pick<Assenza, "data_inizio" | "data_fine">, includiInAttesa: boolean) {
	const altre = await caricaAssenze(db, dip.id, richiesta.data_inizio, richiesta.data_fine);
	const chiusure = await caricaChiusure(db, richiesta.data_inizio, richiesta.data_fine);
	const perAnno = giorniFerieRichiesta(richiesta, altre, chiusure);
	if (perAnno.size === 0) throw new HttpError(400, "Il periodo non contiene giorni lavorativi");
	for (const [anno, giorni] of perAnno) {
		const s = await saldoFerie(db, dip, anno);
		const disponibili = s.residuo - (includiInAttesa ? s.in_attesa : 0);
		if (giorni > disponibili) {
			throw new HttpError(409, `Saldo ferie ${anno} insufficiente: richiesti ${giorni} giorni, disponibili ${disponibili}`);
		}
	}
	return [...perAnno.values()].reduce((a, b) => a + b, 0);
}

async function verificaSovrapposizioni(db: D1Database, dipId: number, tipo: TipoAssenza, dal: string, al: string, escludiId?: number) {
	const esistenti = await caricaAssenze(db, dipId, dal, al);
	const conflitto = esistenti.find(
		(a) =>
			a.id !== escludiId &&
			(assenzaValida(a) || a.stato === "in_attesa") &&
			GRUPPI_INCOMPATIBILI[tipo].includes(a.tipo),
	);
	if (conflitto) {
		throw new HttpError(409, `Periodo già coperto da ${conflitto.tipo} (${conflitto.data_inizio} → ${conflitto.data_fine})`);
	}
}

// ---------------------------------------------------------------- autenticazione

const stato: Handler = async ({ env, utente }) => {
	const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM dipendenti").first<{ n: number }>();
	return json({ configurato: (n?.n ?? 0) > 0, utente, oggi: oraLocale() });
};

const setup: Handler = async ({ req, env }) => {
	const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM dipendenti").first<{ n: number }>();
	if ((n?.n ?? 0) > 0) throw new HttpError(409, "Il sistema è già configurato");
	const b = await leggiJson(req);
	const { pin_hash, pin_salt } = await hashPin(validaPin(b.pin));
	const r = await env.DB.prepare(
		"INSERT INTO dipendenti (matricola, nome, cognome, ruolo, pin_hash, pin_salt) VALUES (?, ?, ?, 'admin', ?, ?)",
	)
		.bind(testo(b.matricola, "matricola", { max: 30 }), testo(b.nome, "nome"), testo(b.cognome, "cognome"), pin_hash, pin_salt)
		.run();
	const id = r.meta.last_row_id;
	await registra(env.DB, id, "setup", { matricola: b.matricola });
	return json({ ok: true }, 201, { "set-cookie": await creaSessione(env.DB, id) });
};

const login: Handler = async ({ req, env }) => {
	const b = await leggiJson(req);
	const matricola = testo(b.matricola, "matricola", { max: 30 });
	const pin = typeof b.pin === "string" ? b.pin : "";
	const d = await env.DB.prepare(
		"SELECT id, pin_hash, pin_salt, tentativi_falliti, bloccato_fino FROM dipendenti WHERE matricola = ? AND attivo = 1",
	)
		.bind(matricola)
		.first<{ id: number; pin_hash: string; pin_salt: string; tentativi_falliti: number; bloccato_fino: string | null }>();
	const adesso = new Date().toISOString();
	if (d?.bloccato_fino && d.bloccato_fino > adesso) {
		throw new HttpError(429, "Troppi tentativi errati. Riprova tra qualche minuto");
	}
	if (!d || !(await verificaPin(pin, d.pin_hash, d.pin_salt))) {
		if (d) {
			const tentativi = d.tentativi_falliti + 1;
			const blocco = tentativi >= MAX_TENTATIVI ? new Date(Date.now() + BLOCCO_MINUTI * 60_000).toISOString() : null;
			await env.DB.prepare("UPDATE dipendenti SET tentativi_falliti = ?, bloccato_fino = ? WHERE id = ?")
				.bind(blocco ? 0 : tentativi, blocco, d.id)
				.run();
		}
		throw new HttpError(401, "Matricola o PIN errati");
	}
	await env.DB.prepare("UPDATE dipendenti SET tentativi_falliti = 0, bloccato_fino = NULL WHERE id = ?").bind(d.id).run();
	return json({ ok: true }, 200, { "set-cookie": await creaSessione(env.DB, d.id) });
};

const logout: Handler = async ({ req, env }) => json({ ok: true }, 200, { "set-cookie": await chiudiSessione(env.DB, req) });

const cambiaPin: Handler = async (ctx) => {
	const u = richiediUtente(ctx);
	const b = await leggiJson(ctx.req);
	const d = await ctx.env.DB.prepare("SELECT pin_hash, pin_salt FROM dipendenti WHERE id = ?")
		.bind(u.id)
		.first<{ pin_hash: string; pin_salt: string }>();
	if (!d || !(await verificaPin(String(b.pin_attuale ?? ""), d.pin_hash, d.pin_salt))) {
		throw new HttpError(400, "PIN attuale errato");
	}
	const { pin_hash, pin_salt } = await hashPin(validaPin(b.pin_nuovo));
	await ctx.env.DB.prepare("UPDATE dipendenti SET pin_hash = ?, pin_salt = ? WHERE id = ?").bind(pin_hash, pin_salt, u.id).run();
	await registra(ctx.env.DB, u.id, "cambio_pin", {});
	return json({ ok: true });
};

// ---------------------------------------------------------------- timbrature

const timbra: Handler = async (ctx) => {
	const u = richiediUtente(ctx);
	const adesso = new Date();
	const { data: oggi, ora } = oraLocale(adesso);
	const ultima = await ctx.env.DB.prepare(
		"SELECT tipo, ts FROM timbrature WHERE dipendente_id = ? AND data = ? ORDER BY ora DESC, id DESC LIMIT 1",
	)
		.bind(u.id, oggi)
		.first<{ tipo: string; ts: string }>();
	if (ultima && adesso.getTime() - new Date(ultima.ts).getTime() < 60_000) {
		throw new HttpError(429, "Hai appena timbrato: attendi un minuto prima di timbrare di nuovo");
	}
	const tipo = ultima?.tipo === "entrata" ? "uscita" : "entrata";
	await ctx.env.DB.prepare("INSERT INTO timbrature (dipendente_id, tipo, ts, data, ora, fonte) VALUES (?, ?, ?, ?, ?, 'web')")
		.bind(u.id, tipo, adesso.toISOString(), oggi, ora)
		.run();
	await risolviAnomalieCoperte(ctx.env.DB, u.id, oggi, oggi);
	return json({ ok: true, tipo, data: oggi, ora }, 201);
};

const elencoTimbrature: Handler = async (ctx) => {
	const id = dipendenteTarget(ctx, ctx.url.searchParams.get("dipendente_id"));
	const m = mese(ctx.url.searchParams.get("mese"));
	return json(await caricaTimbrature(ctx.env.DB, id, `${m}-01`, ultimoGiornoMese(m)));
};

/** Inserimento manuale (correzione) da parte di un amministratore, con motivazione obbligatoria. */
const inserisciTimbratura: Handler = async (ctx) => {
	const admin = richiediAdmin(ctx);
	const b = await leggiJson(ctx.req);
	const dip = await dipendente(ctx.env.DB, Number(b.dipendente_id));
	const giorno = data(b.data, "data");
	if (!isOra(b.ora)) throw new HttpError(400, "Ora non valida (formato HH:MM)");
	if (b.tipo !== "entrata" && b.tipo !== "uscita") throw new HttpError(400, "Tipo non valido");
	const note = testo(b.note, "note (motivazione)", { max: 300 });
	const r = await ctx.env.DB.prepare(
		"INSERT INTO timbrature (dipendente_id, tipo, ts, data, ora, fonte, note) VALUES (?, ?, ?, ?, ?, 'admin', ?)",
	)
		.bind(dip.id, b.tipo, new Date().toISOString(), giorno, b.ora, note)
		.run();
	await risolviAnomalieCoperte(ctx.env.DB, dip.id, giorno, giorno);
	await ctx.env.DB.prepare(
		"UPDATE anomalie SET risolta = 1 WHERE dipendente_id = ? AND data = ? AND tipo = 'uscita_mancante' AND ? = 'uscita'",
	)
		.bind(dip.id, giorno, b.tipo)
		.run();
	await registra(ctx.env.DB, admin.id, "timbratura_manuale", { id: r.meta.last_row_id, dipendente_id: dip.id, data: giorno, ora: b.ora, tipo: b.tipo, note });
	return json({ ok: true }, 201);
};

const eliminaTimbratura: Handler = async (ctx) => {
	const admin = richiediAdmin(ctx);
	const t = await ctx.env.DB.prepare("SELECT * FROM timbrature WHERE id = ?").bind(Number(ctx.params[0])).first();
	if (!t) throw new HttpError(404, "Timbratura non trovata");
	await ctx.env.DB.prepare("DELETE FROM timbrature WHERE id = ?").bind(t.id).run();
	await registra(ctx.env.DB, admin.id, "timbratura_eliminata", t);
	return json({ ok: true });
};

// ---------------------------------------------------------------- assenze

const elencoAssenze: Handler = async (ctx) => {
	const u = richiediUtente(ctx);
	const p = ctx.url.searchParams;
	const tutti = u.ruolo === "admin" && p.get("tutti") === "1";
	const id = tutti ? null : dipendenteTarget(ctx, p.get("dipendente_id"));
	const anno = oraLocale().data.slice(0, 4);
	const dal = isData(p.get("dal")) ? p.get("dal")! : `${Number(anno) - 1}-01-01`;
	const al = isData(p.get("al")) ? p.get("al")! : `${Number(anno) + 1}-12-31`;
	let assenze = await caricaAssenze(ctx.env.DB, id, dal, al);
	const st = p.get("stato");
	if (st) assenze = assenze.filter((a) => a.stato === st);
	return json(assenze);
};

const creaAssenza: Handler = async (ctx) => {
	const u = richiediUtente(ctx);
	const b = await leggiJson(ctx.req);
	const dip = await dipendente(ctx.env.DB, dipendenteTarget(ctx, b.dipendente_id));
	const tipo = b.tipo as TipoAssenza;
	if (!TIPI_ASSENZA.includes(tipo)) throw new HttpError(400, "Tipo di assenza non valido");
	const dal = data(b.data_inizio, "data_inizio");
	const al = tipo === "permesso" ? dal : data(b.data_fine ?? dal, "data_fine");
	if (al < dal) throw new HttpError(400, "La data di fine precede quella di inizio");
	if (giorniTra(dal, al).length > 366) throw new HttpError(400, "Periodo troppo lungo (massimo un anno)");

	const ore = tipo === "permesso" ? numero(b.ore, "ore", 0.5, dip.ore_giornaliere) : null;
	const protocollo = testo(b.protocollo_certificato, "protocollo_certificato", { obbligatorio: false, max: 50 });
	const denuncia = testo(b.numero_denuncia_inail, "numero_denuncia_inail", { obbligatorio: false, max: 50 });
	const descrizione = testo(b.descrizione, "descrizione", { obbligatorio: tipo === "infortunio", max: 1000 });
	if (tipo === "infortunio" && denuncia && u.ruolo !== "admin") {
		throw new HttpError(403, "Il numero di denuncia INAIL è inserito dall'ufficio del personale");
	}

	await verificaSovrapposizioni(ctx.env.DB, dip.id, tipo, dal, al);
	const giustificativo = tipo === "malattia" || tipo === "infortunio";
	const approvataDaAdmin = !giustificativo && u.ruolo === "admin";
	if (tipo === "ferie") await verificaSaldo(ctx.env.DB, dip, { data_inizio: dal, data_fine: al }, !(approvataDaAdmin && b.forza === true));

	const statoIniziale = giustificativo ? "registrata" : approvataDaAdmin ? "approvata" : "in_attesa";
	const r = await ctx.env.DB.prepare(
		`INSERT INTO assenze (dipendente_id, tipo, data_inizio, data_fine, ore, stato, protocollo_certificato, numero_denuncia_inail, descrizione, gestita_da)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(dip.id, tipo, dal, al, ore, statoIniziale, protocollo, denuncia, descrizione, approvataDaAdmin ? u.id : null)
		.run();
	if (statoIniziale !== "in_attesa") await risolviAnomalieCoperte(ctx.env.DB, dip.id, dal, al);
	await registra(ctx.env.DB, u.id, "assenza_creata", { id: r.meta.last_row_id, dipendente_id: dip.id, tipo, dal, al, stato: statoIniziale });
	return json({ ok: true, id: r.meta.last_row_id, stato: statoIniziale }, 201);
};

async function caricaAssenza(db: D1Database, id: string) {
	const a = await db.prepare("SELECT * FROM assenze WHERE id = ?").bind(Number(id)).first<Assenza & Record<string, unknown>>();
	if (!a) throw new HttpError(404, "Assenza non trovata");
	return a;
}

/** Aggiorna dati documentali o prolunga una malattia/infortunio. */
const aggiornaAssenza: Handler = async (ctx) => {
	const u = richiediUtente(ctx);
	const a = await caricaAssenza(ctx.env.DB, ctx.params[0]);
	if (a.dipendente_id !== u.id && u.ruolo !== "admin") throw new HttpError(403, "Non autorizzato");
	if (a.stato === "rifiutata" || a.stato === "annullata") throw new HttpError(409, "Assenza non più modificabile");
	const b = await leggiJson(ctx.req);
	const modifiche: Record<string, unknown> = {};

	if (b.protocollo_certificato !== undefined) {
		if (a.tipo !== "malattia") throw new HttpError(400, "Il protocollo si applica solo alla malattia");
		modifiche.protocollo_certificato = testo(b.protocollo_certificato, "protocollo_certificato", { obbligatorio: false, max: 50 });
	}
	if (b.numero_denuncia_inail !== undefined) {
		if (a.tipo !== "infortunio") throw new HttpError(400, "La denuncia INAIL si applica solo agli infortuni");
		if (u.ruolo !== "admin") throw new HttpError(403, "Il numero di denuncia INAIL è inserito dall'ufficio del personale");
		modifiche.numero_denuncia_inail = testo(b.numero_denuncia_inail, "numero_denuncia_inail", { obbligatorio: false, max: 50 });
	}
	if (b.descrizione !== undefined) {
		modifiche.descrizione = testo(b.descrizione, "descrizione", { obbligatorio: a.tipo === "infortunio", max: 1000 });
	}
	if (b.data_fine !== undefined) {
		if (a.tipo !== "malattia" && a.tipo !== "infortunio") throw new HttpError(400, "Solo malattia e infortunio possono essere prolungati");
		const fine = data(b.data_fine, "data_fine");
		if (fine < a.data_inizio) throw new HttpError(400, "La data di fine precede quella di inizio");
		await verificaSovrapposizioni(ctx.env.DB, a.dipendente_id, a.tipo, a.data_inizio, fine, a.id);
		modifiche.data_fine = fine;
	}
	const campi = Object.keys(modifiche);
	if (!campi.length) throw new HttpError(400, "Nessuna modifica indicata");
	await ctx.env.DB.prepare(
		`UPDATE assenze SET ${campi.map((c) => `${c} = ?`).join(", ")}, aggiornata_il = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
	)
		.bind(...Object.values(modifiche), a.id)
		.run();
	if (modifiche.data_fine) await risolviAnomalieCoperte(ctx.env.DB, a.dipendente_id, a.data_inizio, modifiche.data_fine as string);
	await ctx.env.DB.prepare(
		`UPDATE anomalie SET risolta = 1 WHERE assenza_id = ? AND risolta = 0 AND
		 ((tipo = 'certificato_mancante' AND ? IS NOT NULL) OR (tipo = 'denuncia_inail_mancante' AND ? IS NOT NULL))`,
	)
		.bind(a.id, modifiche.protocollo_certificato ?? null, modifiche.numero_denuncia_inail ?? null)
		.run();
	await registra(ctx.env.DB, u.id, "assenza_modificata", { id: a.id, ...modifiche });
	return json({ ok: true });
};

const decidiAssenza =
	(esito: "approvata" | "rifiutata"): Handler =>
	async (ctx) => {
		const admin = richiediAdmin(ctx);
		const a = await caricaAssenza(ctx.env.DB, ctx.params[0]);
		if (a.stato !== "in_attesa") throw new HttpError(409, "La richiesta è già stata gestita");
		const b = ctx.req.headers.get("content-type")?.includes("json") ? await leggiJson(ctx.req) : {};
		if (esito === "approvata" && a.tipo === "ferie" && b.forza !== true) {
			await verificaSaldo(ctx.env.DB, await dipendente(ctx.env.DB, a.dipendente_id), a, false);
		}
		await ctx.env.DB.prepare(
			"UPDATE assenze SET stato = ?, gestita_da = ?, aggiornata_il = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
		)
			.bind(esito, admin.id, a.id)
			.run();
		if (esito === "approvata") await risolviAnomalieCoperte(ctx.env.DB, a.dipendente_id, a.data_inizio, a.data_fine);
		await registra(ctx.env.DB, admin.id, `assenza_${esito}`, { id: a.id, motivo: b.motivo ?? null });
		return json({ ok: true });
	};

const annullaAssenza: Handler = async (ctx) => {
	const u = richiediUtente(ctx);
	const a = await caricaAssenza(ctx.env.DB, ctx.params[0]);
	const proprietario = a.dipendente_id === u.id;
	if (u.ruolo !== "admin" && !(proprietario && a.stato === "in_attesa")) {
		throw new HttpError(403, "Puoi annullare solo le tue richieste ancora in attesa");
	}
	if (a.stato === "annullata" || a.stato === "rifiutata") throw new HttpError(409, "Assenza già chiusa");
	await ctx.env.DB.prepare(
		"UPDATE assenze SET stato = 'annullata', gestita_da = ?, aggiornata_il = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
	)
		.bind(u.id, a.id)
		.run();
	await registra(ctx.env.DB, u.id, "assenza_annullata", { id: a.id });
	return json({ ok: true });
};

// ---------------------------------------------------------------- calendario e report

const calendario: Handler = async (ctx) => {
	const dip = await dipendente(ctx.env.DB, dipendenteTarget(ctx, ctx.url.searchParams.get("dipendente_id")));
	const m = mese(ctx.url.searchParams.get("mese"));
	const dal = `${m}-01`;
	const al = ultimoGiornoMese(m);
	const giorni = calcolaGiorni({
		dal,
		al,
		oggi: oraLocale().data,
		inizio: dip.data_assunzione,
		timbrature: await caricaTimbrature(ctx.env.DB, dip.id, dal, al),
		assenze: await caricaAssenze(ctx.env.DB, dip.id, dal, al),
		chiusure: await caricaChiusure(ctx.env.DB, dal, al),
	});
	return json({
		dipendente: dip,
		mese: m,
		giorni,
		riepilogo: riepiloga(giorni),
		saldo_ferie: await saldoFerie(ctx.env.DB, dip, Number(m.slice(0, 4))),
	});
};

const saldo: Handler = async (ctx) => {
	const dip = await dipendente(ctx.env.DB, dipendenteTarget(ctx, ctx.url.searchParams.get("dipendente_id")));
	const anno = Number(ctx.url.searchParams.get("anno") ?? oraLocale().data.slice(0, 4));
	if (!Number.isInteger(anno) || anno < 2000 || anno > 2100) throw new HttpError(400, "Anno non valido");
	return json(await saldoFerie(ctx.env.DB, dip, anno));
};

/** Situazione in tempo reale: chi è presente, assente o fuori sede oggi. */
const presenzeOggi: Handler = async (ctx) => {
	richiediAdmin(ctx);
	const oggi = oraLocale().data;
	const { results: dip } = await ctx.env.DB.prepare(
		"SELECT id, matricola, nome, cognome, data_assunzione FROM dipendenti WHERE attivo = 1 ORDER BY cognome, nome",
	).all<{ id: number; matricola: string; nome: string; cognome: string; data_assunzione: string }>();
	const tim = await caricaTimbrature(ctx.env.DB, null, oggi, oggi);
	const ass = await caricaAssenze(ctx.env.DB, null, oggi, oggi);
	const chiusure = await caricaChiusure(ctx.env.DB, oggi, oggi);
	return json(
		dip.map((d) => {
			const [g] = calcolaGiorni({
				dal: oggi,
				al: oggi,
				oggi,
				inizio: d.data_assunzione,
				timbrature: tim.filter((t) => t.dipendente_id === d.id),
				assenze: ass.filter((a) => a.dipendente_id === d.id),
				chiusure,
			});
			return { ...d, stato: g.stato, in_sede: g.timbratura_aperta, timbrature: g.timbrature, minuti_lavorati: g.minuti_lavorati };
		}),
	);
};

async function datiReport(db: D1Database, m: string) {
	const dal = `${m}-01`;
	const al = ultimoGiornoMese(m);
	const oggi = oraLocale().data;
	const { results: dip } = await db
		.prepare("SELECT id, matricola, nome, cognome, giorni_ferie_annui, data_assunzione FROM dipendenti WHERE attivo = 1 ORDER BY cognome, nome")
		.all<Utente & { data_assunzione: string }>();
	const tim = await caricaTimbrature(db, null, dal, al);
	const ass = await caricaAssenze(db, null, dal, al);
	const chiusure = await caricaChiusure(db, dal, al);
	const righe = [];
	for (const d of dip) {
		const giorni = calcolaGiorni({
			dal,
			al,
			oggi,
			inizio: d.data_assunzione,
			timbrature: tim.filter((t) => t.dipendente_id === d.id),
			assenze: ass.filter((a) => a.dipendente_id === d.id),
			chiusure,
		});
		const s = await saldoFerie(db, d, Number(m.slice(0, 4)));
		righe.push({ matricola: d.matricola, cognome: d.cognome, nome: d.nome, ...riepiloga(giorni), ferie_residue: s.residuo });
	}
	return righe;
}

const report: Handler = async (ctx) => {
	richiediAdmin(ctx);
	const m = mese(ctx.url.searchParams.get("mese"));
	return json({ mese: m, righe: await datiReport(ctx.env.DB, m) });
};

const reportCsv: Handler = async (ctx) => {
	richiediAdmin(ctx);
	const m = mese(ctx.url.searchParams.get("mese"));
	const righe = await datiReport(ctx.env.DB, m);
	const intestazioni = [
		"Matricola", "Cognome", "Nome", "Giorni lavorativi", "Giorni presenza", "Ore lavorate", "Giorni ferie",
		"Giorni malattia", "Giorni infortunio", "Ore permesso", "Assenze ingiustificate", "Ferie residue",
	];
	const cella = (v: unknown) => {
		const s = typeof v === "number" ? String(v).replace(".", ",") : String(v ?? "");
		return /[;"\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
	};
	const csv = [intestazioni, ...righe.map((r) => Object.values(r))].map((r) => r.map(cella).join(";")).join("\r\n");
	return new Response("﻿" + csv, {
		headers: {
			"content-type": "text/csv; charset=utf-8",
			"content-disposition": `attachment; filename="presenze-${m}.csv"`,
		},
	});
};

// ---------------------------------------------------------------- anagrafica

const elencoDipendenti: Handler = async (ctx) => {
	richiediAdmin(ctx);
	const { results } = await ctx.env.DB.prepare(
		"SELECT id, matricola, nome, cognome, email, ruolo, ore_giornaliere, giorni_ferie_annui, data_assunzione, attivo, creato_il FROM dipendenti ORDER BY attivo DESC, cognome, nome",
	).all();
	return json(results);
};

const creaDipendente: Handler = async (ctx) => {
	const admin = richiediAdmin(ctx);
	const b = await leggiJson(ctx.req);
	const ruolo = b.ruolo === "admin" ? "admin" : "dipendente";
	const { pin_hash, pin_salt } = await hashPin(validaPin(b.pin));
	const matricola = testo(b.matricola, "matricola", { max: 30 });
	const esiste = await ctx.env.DB.prepare("SELECT 1 FROM dipendenti WHERE matricola = ?").bind(matricola).first();
	if (esiste) throw new HttpError(409, "Matricola già esistente");
	const r = await ctx.env.DB.prepare(
		`INSERT INTO dipendenti (matricola, nome, cognome, email, ruolo, pin_hash, pin_salt, ore_giornaliere, giorni_ferie_annui, data_assunzione)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			matricola,
			testo(b.nome, "nome"),
			testo(b.cognome, "cognome"),
			testo(b.email, "email", { obbligatorio: false }),
			ruolo,
			pin_hash,
			pin_salt,
			numero(b.ore_giornaliere ?? 8, "ore_giornaliere", 1, 12),
			numero(b.giorni_ferie_annui ?? 26, "giorni_ferie_annui", 0, 60),
			data(b.data_assunzione ?? oraLocale().data, "data_assunzione"),
		)
		.run();
	await registra(ctx.env.DB, admin.id, "dipendente_creato", { id: r.meta.last_row_id, matricola, ruolo });
	return json({ ok: true, id: r.meta.last_row_id }, 201);
};

const aggiornaDipendente: Handler = async (ctx) => {
	const admin = richiediAdmin(ctx);
	const dip = await dipendente(ctx.env.DB, Number(ctx.params[0]));
	const b = await leggiJson(ctx.req);
	const m: Record<string, unknown> = {};
	if (b.nome !== undefined) m.nome = testo(b.nome, "nome");
	if (b.cognome !== undefined) m.cognome = testo(b.cognome, "cognome");
	if (b.email !== undefined) m.email = testo(b.email, "email", { obbligatorio: false });
	if (b.ruolo !== undefined) m.ruolo = b.ruolo === "admin" ? "admin" : "dipendente";
	if (b.ore_giornaliere !== undefined) m.ore_giornaliere = numero(b.ore_giornaliere, "ore_giornaliere", 1, 12);
	if (b.giorni_ferie_annui !== undefined) m.giorni_ferie_annui = numero(b.giorni_ferie_annui, "giorni_ferie_annui", 0, 60);
	if (b.data_assunzione !== undefined) m.data_assunzione = data(b.data_assunzione, "data_assunzione");
	if (b.attivo !== undefined) m.attivo = b.attivo ? 1 : 0;
	if (dip.id === admin.id && (m.ruolo === "dipendente" || m.attivo === 0)) {
		throw new HttpError(400, "Non puoi revocare i tuoi privilegi o disattivare il tuo account");
	}
	if (b.pin !== undefined) {
		Object.assign(m, await hashPin(validaPin(b.pin)), { tentativi_falliti: 0, bloccato_fino: null });
	}
	const campi = Object.keys(m);
	if (!campi.length) throw new HttpError(400, "Nessuna modifica indicata");
	await ctx.env.DB.prepare(`UPDATE dipendenti SET ${campi.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`)
		.bind(...Object.values(m), dip.id)
		.run();
	if (m.attivo === 0 || m.pin_hash) await ctx.env.DB.prepare("DELETE FROM sessioni WHERE dipendente_id = ?").bind(dip.id).run();
	await registra(ctx.env.DB, admin.id, "dipendente_modificato", { id: dip.id, campi: campi.filter((c) => !c.startsWith("pin_")) });
	return json({ ok: true });
};

// ---------------------------------------------------------------- anomalie, chiusure, controlli

const elencoAnomalie: Handler = async (ctx) => {
	const u = richiediUtente(ctx);
	const risolte = ctx.url.searchParams.get("risolte") === "1" ? 1 : 0;
	const soloMie = u.ruolo !== "admin";
	const { results } = await ctx.env.DB.prepare(
		`SELECT an.*, d.nome, d.cognome, d.matricola FROM anomalie an JOIN dipendenti d ON d.id = an.dipendente_id
		 WHERE an.risolta = ? ${soloMie ? "AND an.dipendente_id = ?" : ""} ORDER BY an.data DESC, an.id DESC LIMIT 500`,
	)
		.bind(...(soloMie ? [risolte, u.id] : [risolte]))
		.all();
	return json(results);
};

const risolviAnomalia: Handler = async (ctx) => {
	const admin = richiediAdmin(ctx);
	const b = await leggiJson(ctx.req);
	const note = testo(b.note, "note", { obbligatorio: false, max: 300 });
	const r = await ctx.env.DB.prepare("UPDATE anomalie SET risolta = 1, note = COALESCE(?, note) WHERE id = ?")
		.bind(note, Number(ctx.params[0]))
		.run();
	if (!r.meta.changes) throw new HttpError(404, "Anomalia non trovata");
	await registra(ctx.env.DB, admin.id, "anomalia_risolta", { id: Number(ctx.params[0]), note });
	return json({ ok: true });
};

const elencoChiusure: Handler = async (ctx) => {
	richiediUtente(ctx);
	const anno = Number(ctx.url.searchParams.get("anno") ?? oraLocale().data.slice(0, 4));
	const chiusure = await caricaChiusure(ctx.env.DB, `${anno}-01-01`, `${anno}-12-31`);
	return json([...chiusure].map(([data, descrizione]) => ({ data, descrizione })));
};

const creaChiusura: Handler = async (ctx) => {
	const admin = richiediAdmin(ctx);
	const b = await leggiJson(ctx.req);
	const dal = data(b.data_inizio ?? b.data, "data_inizio");
	const al = data(b.data_fine ?? dal, "data_fine");
	if (al < dal || giorniTra(dal, al).length > 60) throw new HttpError(400, "Intervallo non valido (massimo 60 giorni)");
	const descr = testo(b.descrizione, "descrizione");
	await ctx.env.DB.batch(
		giorniTra(dal, al).map((d) =>
			ctx.env.DB.prepare("INSERT OR REPLACE INTO chiusure_aziendali (data, descrizione) VALUES (?, ?)").bind(d, descr),
		),
	);
	await risolviAnomalieChiusura(ctx.env.DB, dal, al);
	await registra(ctx.env.DB, admin.id, "chiusura_creata", { dal, al, descrizione: descr });
	return json({ ok: true }, 201);
};

async function risolviAnomalieChiusura(db: D1Database, dal: string, al: string) {
	await db
		.prepare(
			"UPDATE anomalie SET risolta = 1, note = 'Chiusura aziendale' WHERE tipo = 'assenza_non_giustificata' AND risolta = 0 AND data BETWEEN ? AND ?",
		)
		.bind(dal, al)
		.run();
}

const eliminaChiusura: Handler = async (ctx) => {
	const admin = richiediAdmin(ctx);
	const d = data(ctx.params[0], "data");
	await ctx.env.DB.prepare("DELETE FROM chiusure_aziendali WHERE data = ?").bind(d).run();
	await registra(ctx.env.DB, admin.id, "chiusura_eliminata", { data: d });
	return json({ ok: true });
};

/** Esecuzione manuale dei controlli automatici su una giornata passata. */
const eseguiControlli: Handler = async (ctx) => {
	const admin = richiediAdmin(ctx);
	const b = await leggiJson(ctx.req);
	const giorno = data(b.data ?? aggiungiGiorni(oraLocale().data, -1), "data");
	if (giorno > oraLocale().data) throw new HttpError(400, "Non è possibile controllare giornate future");
	const esito = await controllaGiornata(ctx.env.DB, giorno);
	await registra(ctx.env.DB, admin.id, "controlli_manuali", esito);
	return json(esito);
};

const registroModifiche: Handler = async (ctx) => {
	richiediAdmin(ctx);
	const { results } = await ctx.env.DB.prepare(
		`SELECT r.*, d.nome, d.cognome FROM registro_modifiche r LEFT JOIN dipendenti d ON d.id = r.autore_id
		 ORDER BY r.id DESC LIMIT 200`,
	).all();
	return json(results);
};

// ---------------------------------------------------------------- router

const ROTTE: [string, RegExp, Handler][] = [
	["GET", /^\/api\/stato$/, stato],
	["POST", /^\/api\/setup$/, setup],
	["POST", /^\/api\/login$/, login],
	["POST", /^\/api\/logout$/, logout],
	["POST", /^\/api\/pin$/, cambiaPin],
	["POST", /^\/api\/timbra$/, timbra],
	["GET", /^\/api\/timbrature$/, elencoTimbrature],
	["POST", /^\/api\/timbrature$/, inserisciTimbratura],
	["DELETE", /^\/api\/timbrature\/(\d+)$/, eliminaTimbratura],
	["GET", /^\/api\/assenze$/, elencoAssenze],
	["POST", /^\/api\/assenze$/, creaAssenza],
	["PATCH", /^\/api\/assenze\/(\d+)$/, aggiornaAssenza],
	["POST", /^\/api\/assenze\/(\d+)\/approva$/, decidiAssenza("approvata")],
	["POST", /^\/api\/assenze\/(\d+)\/rifiuta$/, decidiAssenza("rifiutata")],
	["POST", /^\/api\/assenze\/(\d+)\/annulla$/, annullaAssenza],
	["GET", /^\/api\/calendario$/, calendario],
	["GET", /^\/api\/saldo-ferie$/, saldo],
	["GET", /^\/api\/presenze-oggi$/, presenzeOggi],
	["GET", /^\/api\/report$/, report],
	["GET", /^\/api\/report\.csv$/, reportCsv],
	["GET", /^\/api\/dipendenti$/, elencoDipendenti],
	["POST", /^\/api\/dipendenti$/, creaDipendente],
	["PATCH", /^\/api\/dipendenti\/(\d+)$/, aggiornaDipendente],
	["GET", /^\/api\/anomalie$/, elencoAnomalie],
	["POST", /^\/api\/anomalie\/(\d+)\/risolvi$/, risolviAnomalia],
	["GET", /^\/api\/chiusure$/, elencoChiusure],
	["POST", /^\/api\/chiusure$/, creaChiusura],
	["DELETE", /^\/api\/chiusure\/(\d{4}-\d{2}-\d{2})$/, eliminaChiusura],
	["POST", /^\/api\/controlli$/, eseguiControlli],
	["GET", /^\/api\/registro$/, registroModifiche],
];

export async function gestisciApi(req: Request, env: Env, url: URL): Promise<Response> {
	let trovataPath = false;
	for (const [metodo, re, handler] of ROTTE) {
		const m = url.pathname.match(re);
		if (!m) continue;
		trovataPath = true;
		if (metodo !== req.method) continue;
		const utente = await utenteCorrente(env.DB, req);
		return handler({ req, env, url, utente, params: m.slice(1) });
	}
	throw new HttpError(trovataPath ? 405 : 404, trovataPath ? "Metodo non consentito" : "Risorsa non trovata");
}
