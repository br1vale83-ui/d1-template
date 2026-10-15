import { describe, expect, it } from "vitest";
import { calcolaGiorni, calcolaMinuti, calcolaSaldoFerie, riepiloga, type Assenza, type Timbratura } from "../src/calendario";
import { festivitaNazionali, oraLocale, pasqua } from "../src/date";

const nessunaChiusura = new Map<string, string>();
let id = 0;
const ass = (tipo: Assenza["tipo"], dal: string, al: string, stato: Assenza["stato"] = "approvata", ore: number | null = null): Assenza => ({
	id: ++id, dipendente_id: 1, tipo, data_inizio: dal, data_fine: al, stato, ore,
});
const tim = (data: string, tipo: Timbratura["tipo"], ora: string): Timbratura => ({
	id: ++id, dipendente_id: 1, tipo, data, ora, ts: "", fonte: "web", note: null,
});

describe("date", () => {
	it("calcola la Pasqua", () => {
		expect(pasqua(2025)).toBe("2025-04-20");
		expect(pasqua(2026)).toBe("2026-04-05");
		expect(pasqua(2027)).toBe("2027-03-28");
	});

	it("include Pasquetta e San Francesco dal 2026", () => {
		expect(festivitaNazionali(2026).get("2026-04-06")).toBe("Lunedì dell'Angelo");
		expect(festivitaNazionali(2026).has("2026-10-04")).toBe(true);
		expect(festivitaNazionali(2025).has("2025-10-04")).toBe(false);
	});

	it("usa il fuso orario italiano (ora legale)", () => {
		expect(oraLocale(new Date("2026-07-01T22:30:00Z"))).toEqual({ data: "2026-07-02", ora: "00:30" });
		expect(oraLocale(new Date("2026-01-15T07:05:00Z"))).toEqual({ data: "2026-01-15", ora: "08:05" });
	});
});

describe("ore lavorate", () => {
	it("somma più intervalli e rileva l'uscita mancante", () => {
		expect(calcolaMinuti([tim("x", "entrata", "08:00"), tim("x", "uscita", "12:30"), tim("x", "entrata", "13:30"), tim("x", "uscita", "17:00")]))
			.toEqual({ minuti: 480, aperta: false });
		expect(calcolaMinuti([tim("x", "entrata", "08:00")])).toEqual({ minuti: 0, aperta: true });
	});
});

describe("calendario", () => {
	// Dal lunedì 2 al venerdì 6 novembre 2026; l'1/11 è domenica (Ognissanti).
	const base = { dal: "2026-11-01", al: "2026-11-08", oggi: "2026-11-05", chiusure: nessunaChiusura };

	it("assegna lo stato a ogni giornata", () => {
		const giorni = calcolaGiorni({
			...base,
			timbrature: [tim("2026-11-02", "entrata", "09:00"), tim("2026-11-02", "uscita", "17:00")],
			assenze: [ass("ferie", "2026-11-03", "2026-11-03"), ass("malattia", "2026-11-06", "2026-11-06", "registrata")],
		});
		const s = Object.fromEntries(giorni.map((g) => [g.data, g.stato]));
		expect(s).toMatchObject({
			"2026-11-01": "festivo",
			"2026-11-02": "presente",
			"2026-11-03": "ferie",
			"2026-11-04": "assente",
			"2026-11-05": "in_corso",
			"2026-11-06": "malattia",
			"2026-11-07": "non_lavorativo",
		});
		const r = riepiloga(giorni);
		expect(r.ore_lavorate).toBe(8);
		expect(r.giorni_assenza_ingiustificata).toBe(1);
	});

	it("ignora le richieste non approvate e rispetta le chiusure aziendali", () => {
		const [g] = calcolaGiorni({
			...base, dal: "2026-11-04", al: "2026-11-04", timbrature: [],
			assenze: [ass("ferie", "2026-11-04", "2026-11-04", "in_attesa")],
		});
		expect(g.stato).toBe("assente");
		const [c] = calcolaGiorni({
			...base, dal: "2026-11-04", al: "2026-11-04", timbrature: [], assenze: [],
			chiusure: new Map([["2026-11-04", "Patrono"]]),
		});
		expect(c).toMatchObject({ stato: "chiusura", lavorativo: false, festivita: "Patrono" });
	});

	it("un permesso a ore giustifica la giornata senza timbrature", () => {
		const [g] = calcolaGiorni({
			...base, dal: "2026-11-04", al: "2026-11-04", timbrature: [],
			assenze: [ass("permesso", "2026-11-04", "2026-11-04", "approvata", 2)],
		});
		expect(g).toMatchObject({ stato: "permesso", ore_permesso: 2 });
	});
});

describe("saldo ferie", () => {
	it("conta solo i giorni lavorativi e separa godute, future e in attesa", () => {
		const s = calcolaSaldoFerie({
			anno: 2026, oggi: "2026-08-20", spettanti: 26, chiusure: nessunaChiusura,
			assenze: [
				ass("ferie", "2026-08-10", "2026-08-21"), // 10 giorni lavorativi (Ferragosto cade di sabato): 9 fino al 20, 1 futuro
				ass("ferie", "2026-12-24", "2026-12-31", "in_attesa"), // 24, 28, 29, 30, 31 → 5 giorni
				ass("ferie", "2026-09-01", "2026-09-01", "rifiutata"),
			],
		});
		expect(s).toEqual({ anno: 2026, spettanti: 26, godute: 9, pianificate: 1, in_attesa: 5, residuo: 16 });
	});

	it("la malattia durante le ferie le sospende", () => {
		const s = calcolaSaldoFerie({
			anno: 2026, oggi: "2026-12-31", spettanti: 26, chiusure: nessunaChiusura,
			assenze: [ass("ferie", "2026-07-06", "2026-07-10"), ass("malattia", "2026-07-08", "2026-07-09", "registrata")],
		});
		expect(s.godute).toBe(3);
	});

	it("divide le ferie a cavallo d'anno", () => {
		const assenze = [ass("ferie", "2026-12-28", "2027-01-08")];
		const a26 = calcolaSaldoFerie({ anno: 2026, oggi: "2026-01-01", spettanti: 26, chiusure: nessunaChiusura, assenze });
		const a27 = calcolaSaldoFerie({ anno: 2027, oggi: "2026-01-01", spettanti: 26, chiusure: nessunaChiusura, assenze });
		expect(a26.pianificate).toBe(4); // 28-31 dicembre
		expect(a27.pianificate).toBe(4); // 4, 5, 7, 8 gennaio (1 e 6 festivi, 2-3 weekend)
	});
});

describe("data di assunzione", () => {
	it("non segna assenti i giorni precedenti l'assunzione", () => {
		const giorni = calcolaGiorni({
			dal: "2026-11-02", al: "2026-11-04", oggi: "2026-11-10", inizio: "2026-11-04",
			timbrature: [], assenze: [], chiusure: nessunaChiusura,
		});
		expect(giorni.map((g) => g.stato)).toEqual(["non_in_forza", "non_in_forza", "assente"]);
		expect(riepiloga(giorni).giorni_lavorativi).toBe(1);
	});
});
