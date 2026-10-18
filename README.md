# Quiz delle Capitali

Webapp in un unico file, `index.html` (HTML + CSS + JS, nessuna dipendenza né server):
basta aprirla nel browser.

Viene mostrato (e letto ad alta voce) uno Stato scelto a caso, con la sua bandiera, e il giocatore
deve **pronunciare la capitale entro 10 secondi**.

- **Livelli da 5 Stati** con difficoltà crescente: ognuno dei 194 Stati ha una fascia di difficoltà 1–5
  e la composizione di ogni livello è in `LEVEL_PLAN`. Dal livello 9 tutte le domande sono di fascia 5,
  finché restano Stati.
- Servono **almeno 3 risposte esatte su 5** per passare al livello successivo.
- Punti: `10 × difficoltà + secondi rimasti`, più 25 punti bonus per un livello perfetto.
- Classifica salvata nel `localStorage` del browser (locale al dispositivo).
- Riconoscimento vocale in italiano con la Web Speech API (Chrome, Edge, Safari). Il microfono richiede
  HTTPS o `localhost` (Chrome lo consente anche da `file://`). La risposta è accettata anche con accenti,
  grafie straniere e piccoli errori di trascrizione. Senza microfono si può rispondere scrivendo.
- Bandiere da [flagcdn.com](https://flagcdn.com); senza connessione viene mostrata l'emoji della bandiera.
