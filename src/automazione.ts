// Controlli automatici eseguiti ogni sera dal Cron Trigger (vedi wrangler.json).

import { calcolaGiorni } from "./calendario";
import { aggiungiGiorni, oraLocale } from "./date";
import { caricaAssenze, caricaChiusure, caricaTimbrature } from "./dati";

// Giorni concessi per inviare il protocollo del certificato medico.
const GIORNI_CERTIFICATO = 2;
// Il datore di lavoro deve denunciare all'INAIL l'infortunio entro 2 giorni dalla ricezione del certificato.
const GIORNI_DENUNCIA_INAIL = 2;

export interface EsitoControlli {
	data: string;
	assenze_non_giustificate: number;
	uscite_mancanti: number;
	certificati_mancanti: number;
	denunce_inail_mancanti: number;
	sessioni_scadute_rimosse: number;
}

async function segnala(db: D1Database, dipendenteId: number, data: string, tipo: string, assenzaId: number | null, note: string) {
	const r = await db
		.prepare("INSERT OR IGNORE INTO anomalie (dipendente_id, data, tipo, assenza_id, note) VALUES (?, ?, ?, ?, ?)")
		.bind(dipendenteId, data, tipo, assenzaId, note)
		.run();
	return r.meta.changes ?? 0;
}

/** Controlla una giornata considerandola conclusa. Idempotente: può essere rieseguito. */
export async function controllaGiornata(db: D1Database, data: string): Promise<EsitoControlli> {
	const esito: EsitoControlli = {
		data,
		assenze_non_giustificate: 0,
		uscite_mancanti: 0,
		certificati_mancanti: 0,
		denunce_inail_mancanti: 0,
		sessioni_scadute_rimosse: 0,
	};

	const { results: dipendenti } = await db
		.prepare("SELECT id FROM dipendenti WHERE attivo = 1 AND data_assunzione <= ?")
		.bind(data)
		.all<{ id: number }>();
	const chiusure = await caricaChiusure(db, data, data);
	const timbrature = await caricaTimbrature(db, null, data, data);
	const assenze = await caricaAssenze(db, null, data, data);

	for (const { id } of dipendenti) {
		const [g] = calcolaGiorni({
			dal: data,
			al: data,
			oggi: aggiungiGiorni(data, 1),
			timbrature: timbrature.filter((t) => t.dipendente_id === id),
			assenze: assenze.filter((a) => a.dipendente_id === id),
			chiusure,
		});
		if (g.stato === "assente") {
			esito.assenze_non_giustificate += await segnala(db, id, data, "assenza_non_giustificata", null, "Nessuna timbratura né assenza registrata");
		}
		if (g.timbratura_aperta) {
			esito.uscite_mancanti += await segnala(db, id, data, "uscita_mancante", null, `Ultima timbratura: entrata alle ${g.timbrature.at(-1)?.ora}`);
		}
	}

	// Malattie senza protocollo del certificato medico.
	const { results: senzaCertificato } = await db
		.prepare(
			`SELECT id, dipendente_id, data_inizio FROM assenze
			 WHERE tipo = 'malattia' AND stato = 'registrata' AND (protocollo_certificato IS NULL OR protocollo_certificato = '')
			 AND data_inizio <= ?`,
		)
		.bind(aggiungiGiorni(data, -GIORNI_CERTIFICATO))
		.all<{ id: number; dipendente_id: number; data_inizio: string }>();
	for (const a of senzaCertificato) {
		esito.certificati_mancanti += await segnala(db, a.dipendente_id, a.data_inizio, "certificato_mancante", a.id, "Protocollo del certificato medico non ancora inserito");
	}

	// Infortuni senza numero di denuncia INAIL.
	const { results: senzaDenuncia } = await db
		.prepare(
			`SELECT id, dipendente_id, data_inizio FROM assenze
			 WHERE tipo = 'infortunio' AND stato = 'registrata' AND (numero_denuncia_inail IS NULL OR numero_denuncia_inail = '')
			 AND data_inizio <= ?`,
		)
		.bind(aggiungiGiorni(data, -GIORNI_DENUNCIA_INAIL))
		.all<{ id: number; dipendente_id: number; data_inizio: string }>();
	for (const a of senzaDenuncia) {
		esito.denunce_inail_mancanti += await segnala(db, a.dipendente_id, a.data_inizio, "denuncia_inail_mancante", a.id, "Denuncia INAIL non registrata: verificare la scadenza");
	}

	// Chiude le anomalie documentali ormai sanate.
	await db
		.prepare(
			`UPDATE anomalie SET risolta = 1 WHERE risolta = 0 AND tipo IN ('certificato_mancante', 'denuncia_inail_mancante')
			 AND assenza_id IN (SELECT id FROM assenze WHERE stato <> 'registrata'
			   OR (tipo = 'malattia' AND COALESCE(protocollo_certificato, '') <> '')
			   OR (tipo = 'infortunio' AND COALESCE(numero_denuncia_inail, '') <> ''))`,
		)
		.run();

	const pulizia = await db.prepare("DELETE FROM sessioni WHERE scadenza < ?").bind(new Date().toISOString()).run();
	esito.sessioni_scadute_rimosse = pulizia.meta.changes ?? 0;
	return esito;
}

/** Eseguito dal cron: controlla la giornata odierna e ricontrolla la precedente. */
export async function eseguiControlliGiornalieri(db: D1Database): Promise<EsitoControlli[]> {
	const oggi = oraLocale().data;
	const esiti = [await controllaGiornata(db, aggiungiGiorni(oggi, -1)), await controllaGiornata(db, oggi)];
	console.log(JSON.stringify({ evento: "controlli_giornalieri", esiti }));
	return esiti;
}
