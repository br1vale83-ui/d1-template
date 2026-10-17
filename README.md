# Quiz delle Capitali (Worker + D1)

Quiz interattivo: viene mostrato (e letto ad alta voce) il nome di uno Stato scelto a caso
e il giocatore deve **pronunciare la capitale entro 10 secondi**.

- **Livelli da 5 Stati** con difficoltà crescente: ogni Stato ha una fascia di difficoltà 1–5
  (`migrations/0002_create_quiz_tables.sql`) e la composizione di ogni livello è in `LEVEL_PLAN`
  (`src/index.ts`). Dal livello 9 tutte le domande sono di fascia 5, finché restano Stati.
- Servono **almeno 3 risposte esatte su 5** per passare al livello successivo.
- Punti: `10 × difficoltà + secondi rimasti`, più 25 punti bonus per un livello perfetto.
- Classifica salvata in D1 (tabella `scores`).
- Riconoscimento vocale in italiano con la Web Speech API (Chrome, Edge, Safari; richiede HTTPS
  o `localhost`). Il confronto della risposta (`public/match.js`) tollera accenti, grafie straniere
  e piccoli errori di trascrizione. Senza microfono si può rispondere scrivendo.

## Versione single file

`quiz-capitali.html` è lo stesso gioco in un unico file HTML + JS, senza server: basta aprirlo nel
browser (per il microfono serve HTTPS o `localhost`; Chrome lo consente anche da `file://`). Gli Stati sono
incorporati nel file e la classifica è salvata nel `localStorage` del browser.

## Struttura

- `public/` — frontend statico (HTML, CSS, JS) servito come Workers Static Assets
- `src/index.ts` — API: `GET /api/level?n=<livello>&exclude=<id,...>`, `GET /api/scores`, `POST /api/scores`
- `migrations/` — schema e dati (194 Stati con capitale, risposte alternative, difficoltà e continente)

## Sviluppo locale

```bash
npm install
npx wrangler d1 migrations apply DB --local
npx wrangler dev
```

---

# Worker + D1 Database

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/d1-template)

![Worker + D1 Template Preview](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/cb7cb0a9-6102-4822-633c-b76b7bb25900/public)

<!-- dash-content-start -->

D1 is Cloudflare's native serverless SQL database ([docs](https://developers.cloudflare.com/d1/)). This project demonstrates using a Worker with a D1 binding to execute a SQL statement. A simple frontend displays the result of this query:

```SQL
SELECT * FROM comments LIMIT 3;
```

The D1 database is initialized with a `comments` table and this data:

```SQL
INSERT INTO comments (author, content)
VALUES
    ('Kristian', 'Congrats!'),
    ('Serena', 'Great job!'),
    ('Max', 'Keep up the good work!')
;
```

> [!IMPORTANT]
> When using C3 to create this project, select "no" when it asks if you want to deploy. You need to follow this project's [setup steps](https://github.com/cloudflare/templates/tree/main/d1-template#setup-steps) before deploying.

<!-- dash-content-end -->

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```
npm create cloudflare@latest -- --template=cloudflare/templates/d1-template
```

A live public deployment of this template is available at [https://d1-template.templates.workers.dev](https://d1-template.templates.workers.dev)

## Setup Steps

1. Install the project dependencies with a package manager of your choice:
   ```bash
   npm install
   ```
2. Create a [D1 database](https://developers.cloudflare.com/d1/get-started/) with the name "d1-template-database":
   ```bash
   npx wrangler d1 create d1-template-database
   ```
   ...and update the `database_id` field in `wrangler.json` with the new database ID.
3. Run the following db migration to initialize the database (notice the `migrations` directory in this project):
   ```bash
   npx wrangler d1 migrations apply --remote d1-template-database
   ```
4. Deploy the project!
   ```bash
   npx wrangler deploy
   ```
