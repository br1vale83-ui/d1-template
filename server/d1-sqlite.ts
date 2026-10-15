// Adattatore minimo che espone su node:sqlite la parte dell'API D1 usata dall'applicazione,
// così lo stesso codice gira sia su Cloudflare sia su un server proprio.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

class Istruzione {
	constructor(
		private db: DatabaseSync,
		private sql: string,
		private parametri: SQLInputValue[] = [],
	) {}

	bind(...parametri: unknown[]): Istruzione {
		return new Istruzione(this.db, this.sql, parametri as SQLInputValue[]);
	}

	async first<T>(): Promise<T | null> {
		return (this.db.prepare(this.sql).get(...this.parametri) as T | undefined) ?? null;
	}

	async all<T>() {
		return { results: this.db.prepare(this.sql).all(...this.parametri) as T[], success: true, meta: {} };
	}

	async run() {
		return this.esegui();
	}

	esegui() {
		const r = this.db.prepare(this.sql).run(...this.parametri);
		return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
	}
}

export class D1Sqlite {
	readonly db: DatabaseSync;

	constructor(percorso: string) {
		this.db = new DatabaseSync(percorso);
		this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
	}

	prepare(sql: string): Istruzione {
		return new Istruzione(this.db, sql);
	}

	async batch(istruzioni: Istruzione[]) {
		this.db.exec("BEGIN");
		try {
			const esiti = istruzioni.map((i) => i.esegui());
			this.db.exec("COMMIT");
			return esiti;
		} catch (e) {
			this.db.exec("ROLLBACK");
			throw e;
		}
	}

	/** Applica le migrazioni non ancora eseguite, con la stessa tabella di controllo usata da wrangler. */
	applicaMigrazioni(cartella: string): string[] {
		this.db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
			id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)`);
		const fatte = new Set((this.db.prepare("SELECT name FROM d1_migrations").all() as { name: string }[]).map((r) => r.name));
		const applicate: string[] = [];
		for (const file of readdirSync(cartella).filter((f) => f.endsWith(".sql")).sort()) {
			if (fatte.has(file)) continue;
			this.db.exec("BEGIN");
			try {
				this.db.exec(readFileSync(join(cartella, file), "utf8"));
				this.db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(file);
				this.db.exec("COMMIT");
			} catch (e) {
				this.db.exec("ROLLBACK");
				throw new Error(`Migrazione ${file} fallita: ${(e as Error).message}`);
			}
			applicate.push(file);
		}
		return applicate;
	}
}
