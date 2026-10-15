// Logica pura: calcolo dello stato di ogni giornata, ore lavorate e saldo ferie.

import { festivitaNazionali, giornoSettimana, giorniTra } from "./date";

export type TipoAssenza = "ferie" | "permesso" | "malattia" | "infortunio";
export type StatoAssenza = "in_attesa" | "approvata" | "rifiutata" | "registrata" | "annullata";

export interface Timbratura {
	id: number;
	dipendente_id: number;
	tipo: "entrata" | "uscita";
	ts: string;
	data: string;
	ora: string;
	fonte: string;
	note: string | null;
}

export interface Assenza {
	id: number;
	dipendente_id: number;
	tipo: TipoAssenza;
	data_inizio: string;
	data_fine: string;
	ore: number | null;
	stato: StatoAssenza;
}

export type StatoGiorno =
	| "non_lavorativo"
	| "festivo"
	| "chiusura"
	| "infortunio"
	| "malattia"
	| "ferie"
	| "permesso"
	| "presente"
	| "assente"
	| "in_corso"
	| "futuro"
	| "non_in_forza";

export interface Giorno {
	data: string;
	stato: StatoGiorno;
	lavorativo: boolean;
	festivita?: string;
	minuti_lavorati: number;
	ore_permesso: number;
	timbratura_aperta: boolean;
	timbrature: Pick<Timbratura, "tipo" | "ora" | "fonte">[];
}

/** Assenze che contano sul calendario (approvate o registrate). */
export function assenzaValida(a: Pick<Assenza, "stato">): boolean {
	return a.stato === "approvata" || a.stato === "registrata";
}

export function isLavorativo(data: string, chiusure: Map<string, string>): { lavorativo: boolean; motivo?: StatoGiorno; descrizione?: string } {
	const fest = festivitaNazionali(Number(data.slice(0, 4))).get(data);
	if (fest) return { lavorativo: false, motivo: "festivo", descrizione: fest };
	const gs = giornoSettimana(data);
	if (gs === 0 || gs === 6) return { lavorativo: false, motivo: "non_lavorativo" };
	const ch = chiusure.get(data);
	if (ch) return { lavorativo: false, motivo: "chiusura", descrizione: ch };
	return { lavorativo: true };
}

function minuti(ora: string): number {
	const [h, m] = ora.split(":").map(Number);
	return h * 60 + m;
}

/** Somma gli intervalli entrata→uscita di una giornata. */
export function calcolaMinuti(timbrature: Pick<Timbratura, "tipo" | "ora">[]): { minuti: number; aperta: boolean } {
	let tot = 0;
	let inizio: number | null = null;
	for (const t of [...timbrature].sort((a, b) => a.ora.localeCompare(b.ora))) {
		if (t.tipo === "entrata") {
			if (inizio === null) inizio = minuti(t.ora);
		} else if (inizio !== null) {
			tot += Math.max(0, minuti(t.ora) - inizio);
			inizio = null;
		}
	}
	return { minuti: tot, aperta: inizio !== null };
}

// Priorità: l'infortunio e la malattia prevalgono sulle ferie (la malattia sospende le ferie).
const PRIORITA: TipoAssenza[] = ["infortunio", "malattia", "ferie"];

export function calcolaGiorni(params: {
	dal: string;
	al: string;
	oggi: string;
	timbrature: Timbratura[];
	assenze: Assenza[];
	chiusure: Map<string, string>;
	/** Data di assunzione: i giorni precedenti non contano. */
	inizio?: string;
}): Giorno[] {
	const { oggi, chiusure, inizio } = params;
	const perData = new Map<string, Timbratura[]>();
	for (const t of params.timbrature) {
		const l = perData.get(t.data) ?? [];
		l.push(t);
		perData.set(t.data, l);
	}
	const valide = params.assenze.filter(assenzaValida);

	return giorniTra(params.dal, params.al).map((data) => {
		const tim = perData.get(data) ?? [];
		const { minuti: min, aperta } = calcolaMinuti(tim);
		const cal = inizio && data < inizio ? { lavorativo: false, motivo: "non_in_forza" as const, descrizione: undefined } : isLavorativo(data, chiusure);
		const attive = valide.filter((a) => a.data_inizio <= data && a.data_fine >= data);
		const orePermesso = attive.filter((a) => a.tipo === "permesso").reduce((s, a) => s + (a.ore ?? 0), 0);

		let stato: StatoGiorno;
		const intera = PRIORITA.find((tipo) => attive.some((a) => a.tipo === tipo));
		if (!cal.lavorativo) stato = tim.length ? "presente" : cal.motivo!;
		else if (intera) stato = intera;
		else if (tim.length) stato = data === oggi && aperta ? "in_corso" : "presente";
		else if (orePermesso > 0) stato = "permesso";
		else if (data < oggi) stato = "assente";
		else if (data === oggi) stato = "in_corso";
		else stato = "futuro";

		return {
			data,
			stato,
			lavorativo: cal.lavorativo,
			festivita: cal.descrizione,
			minuti_lavorati: min,
			ore_permesso: orePermesso,
			timbratura_aperta: aperta,
			timbrature: tim.sort((a, b) => a.ora.localeCompare(b.ora)).map(({ tipo, ora, fonte }) => ({ tipo, ora, fonte })),
		};
	});
}

/** Giorni lavorativi di ferie effettivamente consumati da una richiesta, per anno. */
export function giorniFerieRichiesta(
	richiesta: Pick<Assenza, "data_inizio" | "data_fine">,
	altre: Assenza[],
	chiusure: Map<string, string>,
): Map<number, number> {
	const out = new Map<number, number>();
	const coperture = altre.filter((a) => assenzaValida(a) && (a.tipo === "malattia" || a.tipo === "infortunio"));
	for (const d of giorniTra(richiesta.data_inizio, richiesta.data_fine)) {
		if (!isLavorativo(d, chiusure).lavorativo) continue;
		if (coperture.some((a) => a.data_inizio <= d && a.data_fine >= d)) continue;
		const anno = Number(d.slice(0, 4));
		out.set(anno, (out.get(anno) ?? 0) + 1);
	}
	return out;
}

export interface SaldoFerie {
	anno: number;
	spettanti: number;
	godute: number;
	pianificate: number;
	in_attesa: number;
	residuo: number;
}

export function calcolaSaldoFerie(params: {
	anno: number;
	oggi: string;
	spettanti: number;
	assenze: Assenza[];
	chiusure: Map<string, string>;
}): SaldoFerie {
	const { anno, oggi, assenze, chiusure } = params;
	let godute = 0;
	let pianificate = 0;
	let inAttesa = 0;
	for (const a of assenze) {
		if (a.tipo !== "ferie") continue;
		const giorniPerAnno = giorniFerieRichiesta(a, assenze, chiusure);
		if (!giorniPerAnno.get(anno)) continue;
		if (a.stato === "in_attesa") {
			inAttesa += giorniPerAnno.get(anno)!;
		} else if (a.stato === "approvata") {
			const coperture = assenze.filter((x) => assenzaValida(x) && (x.tipo === "malattia" || x.tipo === "infortunio"));
			for (const d of giorniTra(a.data_inizio, a.data_fine)) {
				if (Number(d.slice(0, 4)) !== anno || !isLavorativo(d, chiusure).lavorativo) continue;
				if (coperture.some((x) => x.data_inizio <= d && x.data_fine >= d)) continue;
				if (d <= oggi) godute++;
				else pianificate++;
			}
		}
	}
	return {
		anno,
		spettanti: params.spettanti,
		godute,
		pianificate,
		in_attesa: inAttesa,
		residuo: params.spettanti - godute - pianificate,
	};
}

export interface RiepilogoMese {
	giorni_lavorativi: number;
	giorni_presenza: number;
	ore_lavorate: number;
	giorni_ferie: number;
	giorni_malattia: number;
	giorni_infortunio: number;
	ore_permesso: number;
	giorni_assenza_ingiustificata: number;
}

export function riepiloga(giorni: Giorno[]): RiepilogoMese {
	const conta = (s: StatoGiorno) => giorni.filter((g) => g.stato === s).length;
	return {
		giorni_lavorativi: giorni.filter((g) => g.lavorativo).length,
		giorni_presenza: giorni.filter((g) => g.minuti_lavorati > 0 || g.timbrature.length > 0).length,
		ore_lavorate: Math.round((giorni.reduce((s, g) => s + g.minuti_lavorati, 0) / 60) * 100) / 100,
		giorni_ferie: conta("ferie"),
		giorni_malattia: conta("malattia"),
		giorni_infortunio: conta("infortunio"),
		ore_permesso: giorni.reduce((s, g) => s + g.ore_permesso, 0),
		giorni_assenza_ingiustificata: conta("assente"),
	};
}
