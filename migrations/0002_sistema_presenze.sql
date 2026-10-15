-- Migration number: 0002 	 2026-10-15T00:00:00.000Z
-- Sistema di registrazione presenze, malattia, infortuni e ferie.

DROP TABLE IF EXISTS comments;

CREATE TABLE IF NOT EXISTS dipendenti (
    id INTEGER PRIMARY KEY NOT NULL,
    matricola TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    cognome TEXT NOT NULL,
    email TEXT,
    ruolo TEXT NOT NULL DEFAULT 'dipendente' CHECK (ruolo IN ('admin', 'dipendente')),
    pin_hash TEXT NOT NULL,
    pin_salt TEXT NOT NULL,
    ore_giornaliere REAL NOT NULL DEFAULT 8,
    giorni_ferie_annui INTEGER NOT NULL DEFAULT 26,
    data_assunzione TEXT NOT NULL DEFAULT (date('now')),
    attivo INTEGER NOT NULL DEFAULT 1,
    tentativi_falliti INTEGER NOT NULL DEFAULT 0,
    bloccato_fino TEXT,
    creato_il TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessioni (
    token_hash TEXT PRIMARY KEY NOT NULL,
    dipendente_id INTEGER NOT NULL REFERENCES dipendenti(id),
    scadenza TEXT NOT NULL
);

-- Ogni timbratura memorizza il timestamp UTC e la data/ora locale (Europe/Rome).
CREATE TABLE IF NOT EXISTS timbrature (
    id INTEGER PRIMARY KEY NOT NULL,
    dipendente_id INTEGER NOT NULL REFERENCES dipendenti(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('entrata', 'uscita')),
    ts TEXT NOT NULL,
    data TEXT NOT NULL,
    ora TEXT NOT NULL,
    fonte TEXT NOT NULL DEFAULT 'web' CHECK (fonte IN ('web', 'admin')),
    note TEXT
);
CREATE INDEX IF NOT EXISTS idx_timbrature_dip_data ON timbrature (dipendente_id, data);

-- Ferie, permessi, malattia e infortuni.
-- Ferie e permessi nascono "in_attesa" e vanno approvati; malattia e infortunio sono "registrata".
CREATE TABLE IF NOT EXISTS assenze (
    id INTEGER PRIMARY KEY NOT NULL,
    dipendente_id INTEGER NOT NULL REFERENCES dipendenti(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('ferie', 'permesso', 'malattia', 'infortunio')),
    data_inizio TEXT NOT NULL,
    data_fine TEXT NOT NULL,
    ore REAL,
    stato TEXT NOT NULL CHECK (stato IN ('in_attesa', 'approvata', 'rifiutata', 'registrata', 'annullata')),
    protocollo_certificato TEXT,
    numero_denuncia_inail TEXT,
    descrizione TEXT,
    gestita_da INTEGER REFERENCES dipendenti(id),
    creata_il TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    aggiornata_il TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (data_fine >= data_inizio)
);
CREATE INDEX IF NOT EXISTS idx_assenze_dip_date ON assenze (dipendente_id, data_inizio, data_fine);

-- Chiusure aziendali (patrono, ponti, chiusura estiva) che si aggiungono alle festività nazionali.
CREATE TABLE IF NOT EXISTS chiusure_aziendali (
    data TEXT PRIMARY KEY NOT NULL,
    descrizione TEXT NOT NULL
);

-- Anomalie rilevate dai controlli automatici.
CREATE TABLE IF NOT EXISTS anomalie (
    id INTEGER PRIMARY KEY NOT NULL,
    dipendente_id INTEGER NOT NULL REFERENCES dipendenti(id),
    data TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('assenza_non_giustificata', 'uscita_mancante', 'certificato_mancante', 'denuncia_inail_mancante')),
    assenza_id INTEGER REFERENCES assenze(id),
    risolta INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    rilevata_il TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (dipendente_id, data, tipo)
);

-- Registro delle operazioni rilevanti (tracciabilità delle modifiche).
CREATE TABLE IF NOT EXISTS registro_modifiche (
    id INTEGER PRIMARY KEY NOT NULL,
    ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    autore_id INTEGER REFERENCES dipendenti(id),
    azione TEXT NOT NULL,
    dettagli TEXT
);
