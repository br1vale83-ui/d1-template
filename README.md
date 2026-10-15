# Registro presenze

Sistema digitale per registrare **presenze, ferie, permessi, malattia e infortuni**, con controlli automatici giornalieri. Gira su Cloudflare Workers con database D1 e un'interfaccia web responsive utilizzabile da PC, tablet o smartphone.

## Funzionalità

**Dipendenti**
- Timbratura di entrata e uscita con un solo pulsante. Ora e data vengono prese dal server (fuso Europe/Rome), non dal dispositivo.
- Richiesta di ferie e permessi a ore, con controllo automatico del saldo residuo e delle sovrapposizioni.
- Comunicazione della malattia con il numero di protocollo del certificato INPS. La diagnosi non viene mai richiesta.
- Segnalazione degli infortuni, con descrizione dell'accaduto.
- Calendario mensile personale con ore lavorate, saldo ferie e anomalie.

**Ufficio del personale (amministratori)**
- Situazione in tempo reale: chi è in servizio, in ferie, in malattia o non ha ancora timbrato.
- Approvazione o rifiuto delle richieste di ferie e permessi.
- Registrazione del numero di denuncia INAIL per gli infortuni.
- Correzione manuale delle timbrature con motivazione obbligatoria.
- Report mensile per dipendente, esportabile in CSV per Excel o per il consulente paghe.
- Anagrafica dipendenti: ore giornaliere, giorni di ferie annui, data di assunzione, reset del PIN.
- Chiusure aziendali (patrono, ponti, chiusura estiva), in aggiunta alle festività nazionali già incluse.
- Registro di tutte le modifiche.

**Automatismi**
- Ogni sera alle 21:30 UTC (Cron Trigger) il sistema controlla la giornata e segnala come anomalie:
  - giornate lavorative senza timbrature né giustificativi;
  - uscite non timbrate;
  - malattie senza protocollo del certificato dopo 2 giorni;
  - infortuni senza denuncia INAIL dopo 2 giorni. La denuncia va inoltrata entro 2 giorni dal ricevimento del certificato medico.
- Le anomalie si chiudono da sole quando arriva il giustificativo: assenza approvata, timbratura corretta, protocollo inserito.
- La malattia o l'infortunio durante le ferie **sospende le ferie**: quei giorni non vengono scalati dal saldo.
- Festività nazionali calcolate in automatico, compresi Pasquetta e San Francesco (4 ottobre, dal 2026).

## Regole di calcolo

| Tipo | Stato iniziale | Note |
|---|---|---|
| Ferie | in attesa → approvata/rifiutata | Contano solo i giorni lavorativi; controllo del saldo per anno |
| Permesso | in attesa → approvata/rifiutata | A ore, in un singolo giorno |
| Malattia | registrata | Prevale sulle ferie; protocollo del certificato richiesto |
| Infortunio | registrata | Descrizione obbligatoria; numero di denuncia INAIL inserito dall'amministratore |

Quando un amministratore inserisce ferie o permessi per un dipendente, la richiesta risulta già approvata.

## Avvio in locale

```bash
npm install
npm run dev          # applica le migrazioni al D1 locale e avvia http://localhost:8787
npm test             # test della logica di calcolo
```

Al primo accesso l'applicazione chiede di creare l'account amministratore.

Per provare il controllo serale in locale:

```bash
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=30+21+*+*+*"
```

## Pubblicazione su Cloudflare

```bash
npm run deploy       # applica le migrazioni al D1 remoto e pubblica il Worker
```

## Installazione su un server in ufficio (Ubuntu)

In alternativa a Cloudflare, lo stesso codice gira su un server proprio con Node.js e un database SQLite su file. I controlli serali e un backup giornaliero vengono eseguiti dal servizio stesso.

Requisito: **Node.js 22.13 o successivo**. Si verifica con `node -v`; se manca:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt-get install -y nodejs
```

Installazione, e anche aggiornamento, dalla cartella del repository:

```bash
git clone https://github.com/br1vale83-ui/d1-template.git registro-presenze
cd registro-presenze
git checkout claude/sistema-presenze
sudo ./deploy/installa.sh
```

Lo script crea l'utente di sistema `presenze` e installa il programma in `/opt/registro-presenze`. I dati vanno in `/var/lib/registro-presenze`, la configurazione in `/etc/registro-presenze.env`. Il servizio systemd `registro-presenze` parte all'avvio. Poi si apre `http://<ip-del-server>:8787/` e si crea l'amministratore.

| Cosa | Dove / comando |
|---|---|
| Database | `/var/lib/registro-presenze/presenze.db` |
| Backup giornalieri (ultimi 30) | `/var/lib/registro-presenze/backup/` |
| Configurazione (porta, ora dei controlli) | `/etc/registro-presenze.env`, poi `sudo systemctl restart registro-presenze` |
| Log | `journalctl -u registro-presenze -f` |
| Aggiornare | `git pull && sudo ./deploy/installa.sh` |

**HTTPS.** In rete locale il servizio funziona anche in HTTP. Se deve essere raggiungibile da fuori ufficio, ad esempio per timbrare dallo smartphone, va messo dietro un reverse proxy con HTTPS. Con Caddy basta un `Caddyfile` come:

```
presenze.tuodominio.it {
	reverse_proxy 127.0.0.1:8787
}
```

In quel caso imposta `INDIRIZZO=127.0.0.1` e `PROXY_HTTPS=1` in `/etc/registro-presenze.env`.

Per provarlo senza installarlo: `npm run build:server && npm run start:server`. I dati finiscono in `./dati`.

## API principali

Tutte le rotte sono sotto `/api` e usano JSON. L'autenticazione avviene tramite cookie di sessione HttpOnly, ottenuto con `POST /api/login`.

| Metodo | Percorso | Descrizione |
|---|---|---|
| POST | `/api/timbra` | Timbratura (alterna entrata/uscita) |
| GET | `/api/calendario?mese=AAAA-MM` | Giornate, riepilogo e saldo ferie |
| GET/POST | `/api/assenze` | Elenco e creazione di ferie, permessi, malattia, infortuni |
| PATCH | `/api/assenze/:id` | Protocollo certificato, denuncia INAIL, prolungamento |
| POST | `/api/assenze/:id/approva` · `rifiuta` · `annulla` | Gestione delle richieste |
| GET | `/api/presenze-oggi` | Situazione in tempo reale (admin) |
| GET | `/api/report?mese=` · `/api/report.csv?mese=` | Report mensile (admin) |
| GET/POST/PATCH | `/api/dipendenti` | Anagrafica (admin) |
| GET | `/api/anomalie` | Anomalie aperte |
| POST | `/api/controlli` | Riesegue i controlli su una giornata (admin) |

## Sicurezza e privacy

- I PIN sono salvati con PBKDF2-SHA256 e salt casuale. Dopo 5 tentativi errati l'account si blocca per 15 minuti.
- Le sessioni sono salvate solo come hash e scadono dopo 12 ore.
- Ogni dipendente vede solo i propri dati.
- Per la malattia si registra solo il numero di protocollo, nessun dato sanitario.
- Prima dell'uso in produzione serve l'informativa privacy ai dipendenti (GDPR art. 13) e la verifica con il consulente del lavoro e le rappresentanze sindacali, anche in relazione all'art. 4 dello Statuto dei Lavoratori.
