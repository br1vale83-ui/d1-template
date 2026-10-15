// Accesso ai dati su D1.

import type { Assenza, Timbratura } from "./calendario";

export async function caricaChiusure(db: D1Database, dal: string, al: string): Promise<Map<string, string>> {
	const { results } = await db
		.prepare("SELECT data, descrizione FROM chiusure_aziendali WHERE data BETWEEN ? AND ?")
		.bind(dal, al)
		.all<{ data: string; descrizione: string }>();
	return new Map(results.map((r) => [r.data, r.descrizione]));
}

export async function caricaTimbrature(db: D1Database, dipendenteId: number | null, dal: string, al: string): Promise<Timbratura[]> {
	const filtro = dipendenteId === null ? "" : "AND dipendente_id = ?";
	const parametri = dipendenteId === null ? [dal, al] : [dal, al, dipendenteId];
	const { results } = await db
		.prepare(`SELECT * FROM timbrature WHERE data BETWEEN ? AND ? ${filtro} ORDER BY data, ora, id`)
		.bind(...parametri)
		.all<Timbratura>();
	return results;
}

/** Assenze (in qualsiasi stato) che si sovrappongono all'intervallo. */
export async function caricaAssenze(db: D1Database, dipendenteId: number | null, dal: string, al: string): Promise<Assenza[]> {
	const filtro = dipendenteId === null ? "" : "AND a.dipendente_id = ?";
	const parametri = dipendenteId === null ? [al, dal] : [al, dal, dipendenteId];
	const { results } = await db
		.prepare(
			`SELECT a.*, d.nome, d.cognome, d.matricola FROM assenze a JOIN dipendenti d ON d.id = a.dipendente_id
			 WHERE a.data_inizio <= ? AND a.data_fine >= ? ${filtro} ORDER BY a.data_inizio DESC, a.id DESC`,
		)
		.bind(...parametri)
		.all<Assenza>();
	return results;
}

export async function registra(db: D1Database, autoreId: number | null, azione: string, dettagli: unknown): Promise<void> {
	await db
		.prepare("INSERT INTO registro_modifiche (autore_id, azione, dettagli) VALUES (?, ?, ?)")
		.bind(autoreId, azione, JSON.stringify(dettagli))
		.run();
}

/** Chiude automaticamente le anomalie di assenza coperte da un giustificativo. */
export async function risolviAnomalieCoperte(db: D1Database, dipendenteId: number, dal: string, al: string): Promise<void> {
	await db
		.prepare(
			`UPDATE anomalie SET risolta = 1, note = COALESCE(note, 'Giustificata da assenza registrata')
			 WHERE dipendente_id = ? AND tipo = 'assenza_non_giustificata' AND risolta = 0 AND data BETWEEN ? AND ?`,
		)
		.bind(dipendenteId, dal, al)
		.run();
}
