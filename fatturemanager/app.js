/**
 * FattureManager Pro — app.js (v2.20.0)
 * - Riconciliazione cassa-banca con automazione versamento
 * - Arrotondamento preciso (epsilon) per evitare residui 0,01€
 * - Modifica completa pagamento (data, importo, metodo)
 * - Report HTML con movimenti cassa in tabella
 * - Filtro nel modale di collegamento movimento bancario
 * - UID con crypto.randomUUID()
 * v2.13.0 — fix: segno note di credito manuali, mapping codici TD FatturaPA, rollover non spezza più
 *           i collegamenti tra documenti saldati e movimenti bancari ancora attivi
 * v2.14.0 — fix: arrotondamento finale in confirmRec ora effettivo (prima era codice morto);
 *           backup automatici scritti anche nella cartella dati su USB (sottocartella "backup/"),
 *           non più solo in localStorage; rimossa la chiave di backup settimanale mai ripulita
 * v2.15.0 — nuovo: dashboard "⏰ Scadenze" — fatture attive/passive non saldate raggruppate per
 *           urgenza (scadute / entro 7gg / entro 30gg), con filtri e accesso rapido ai pagamenti
 * v2.16.0 — nuovo: Report IVA periodico per aliquota (vendite/acquisti, saldo a debito/credito,
 *           export CSV); grafico andamento cashflow mensile (banca+cassa) con flusso cumulato
 * v2.17.0 — nuovo: filtro Anno (oltre al Mese) nelle viste Attive/Passive/Archivio; checkIntegrity
 *           ora gira anche prima del rollover e non cancella più i collegamenti verso documenti
 *           archiviati (solo verso quelli davvero cancellati); motore di matching automatico
 *           riscritto — segnali nome/numero/importo separati, forme societarie generiche (srl,
 *           spa...) escluse dal conteggio, somiglianza fuzzy su finestra invece che su stringa
 *           intera, auto-selezione solo con almeno due segnali forti concordi
 * v2.18.0 — matching: tolleranza sull'importo (max 3€/8%, es. tassa di soggiorno pagata a parte)
 *           con importo esatto/vicino UNIVOCO tra i candidati considerato segnale forte da solo;
 *           nuovo segnale data fattura vicina alla data movimento (fornitori tipo hotel fatturano
 *           a ridosso del pagamento); per fornitori ricorrenti con più fatture aperte, l'auto-
 *           selezione basata sul nome ora richiede che sia la fattura con la data più vicina al
 *           movimento, non la prima disponibile
 * v2.19.0 — fix: fsPdfPut non fallisce più silenziosamente — verifica di lettura subito dopo la
 *           scrittura su chiavetta (individua scritture interrotte) e avvisa esplicitamente se un
 *           PDF finisce nel fallback locale invece che sulla chiavetta; nuovo "🔍 Verifica PDF" per
 *           scansionare tutti i PDF allegati (attivi/passivi/archiviati) e segnalare quelli
 *           troncati o mancanti, con link diretto per riaprire la fattura e ricaricarli
 * v2.20.0 — nuovo: "📎 Importa da PDF" in Fatture Passive — estrae (best effort, da verificare)
 *           ragione sociale/numero/data/importo da PDF di fornitori esteri senza XML e pre-compila
 *           il form (IVA 0% preimpostata), allegando subito il PDF; nuovo "⚙️ Chiusura Automatica"
 *           — regole persistite parola chiave→categoria (F24, stipendi, commissioni, assicurazioni)
 *           che scansionano i movimenti aperti e propongono la chiusura forzata in blocco, sempre
 *           con anteprima e conferma manuale, mai scrittura automatica silenziosa
 * v2.21.0 — nuovo: avviso in-app quando l'app viene aperta da un percorso di rete (file://server/...,
 *           anche tramite unità mappata) invece che da un disco locale — Chrome/Edge trattano questi
 *           percorsi come origini instabili e i dati salvati (IndexedDB, permessi cartella) possono
 *           risultare incompleti o "sparire"; banner rosso in testa alla pagina con spiegazione e
 *           indicazione a spostare l'archivio su una chiavetta USB o disco realmente locale
 * v2.22.0 — correzioni di integrità dati (nessuna nuova funzione, formato data.json invariato):
 *           - rollover: le fatture saldate ma escluse (ancora collegate a movimenti attivi) non
 *             vengono più cancellate — restano tra le attive/passive come indicato in anteprima
 *           - checkIntegrity: le note di credito usate in compensazione non vengono più "riaperte"
 *             (il loro pagato conta anche le compensazioni registrate sulle fatture)
 *           - ripristino da archivio: le fatture ATTIVE riportano indietro anche i movimenti collegati
 *           - modifica pagamento: rettifica cassa corretta anche quando cambia il metodo
 *             (contanti → altro e altro → contanti)
 *           - import CSV: non scarta più movimenti identici legittimi (es. due commissioni uguali
 *             nello stesso giorno); duplicato solo se già presente nei dati prima dell'import
 *           - import XML: duplicato = ragione sociale + numero + ANNO; XML malformati rifiutati
 *           - eliminazione fattura: rimossi collegamenti ai movimenti, compensazioni con note di
 *             credito, rettifica cassa per i pagamenti in contanti, PDF allegato
 *           - eliminazione movimento / collegamento cassa: annullato anche il versamento cassa→banca
 *           - ricalcola cassa: nessuna modifica se si annulla; mantenuti prelievi e versamenti manuali
 *           - backup localStorage: tiene solo gli ultimi 2 giorni (limite ~5MB) e non salva mai lo
 *             stato vuoto all'avvio prima dell'apertura dei dati
 *           - PDF salvato nel fallback locale: non più segnato come "non allegato"
 *           - modifica fattura: blocco se il nuovo totale è inferiore al già pagato; src originale
 *             conservata
 *           - stato nota di credito parzialmente usata ora "parziale" (non più verde)
 *           - eliminazione abbinamento: rimosso un solo pagamento anche con importi uguali
 *           - sicurezza: nomi con apostrofo (es. Dell'Acqua) non rompono più i pulsanti; escape di
 *             numero fattura, metodi di pagamento personalizzati, intestazioni CSV
 *           - avviso alla chiusura della pagina se ci sono modifiche non ancora salvate
 * v2.23.0 — nuovo: ritenuta d'acconto e split payment
 *           - ogni documento può avere `ritenuta` (€) e `ivaSplit` (€, IVA versata direttamente dal
 *             cliente PA). Il "netto da pagare" = totale − ritenuta − IVA split è la base di residuo,
 *             stato, scadenze, riconciliazione e rollover: queste fatture ora si chiudono a zero
 *           - import XML: letti DatiRitenuta/ImportoRitenuta (anche multipli) ed EsigibilitaIVA = S
 *           - form fattura: campo ritenuta (con scorciatoie 20%/4% dell'imponibile), casella split
 *             payment, totale "Netto da pagare"
 *           - report IVA: l'IVA delle vendite in split payment non è più conteggiata a debito;
 *             nuovo riepilogo ritenute (subite sulle attive, da versare con F24 sulle passive, con
 *             scadenza al 16 del mese successivo al pagamento), esportabile in CSV
 *           - badge RIT / SPLIT in tabella, export CSV fatture con colonne ritenuta/IVA split/netto
 *           - campi opzionali: i dati esistenti restano validi (senza ritenuta né split)
 */

// ======================== STATO GLOBALE ========================
let S = { a: [], p: [], suppliers: [], customMods: [], movimenti: [], cassa: { saldo: 0, movimenti: [] }, banche: [], archive: { docs: [], movimenti: [] }, regoleChiusura: [] };
let sortS = {
  a: { col: 'data', dir: 'desc' },
  p: { col: 'data', dir: 'desc' },
  m: { col: 'data', dir: 'desc' }
};
let sortArchive = {
  a: { col: 'data', dir: 'desc' },
  p: { col: 'data', dir: 'desc' },
  m: { col: 'data', dir: 'desc' }
};
let curType = 'a';
let editId = null;
let chartClienti = null, chartFornitori = null, chartCashflow = null;

let _recMovId = null;
let _recSelections = {};
let _recCandidateScores = {}; // key 'a_id'/'p_id' -> {score, confidence} calcolati da renderRecModal
let _allCandidates = [];
let _linkInvId = null;
let _linkInvType = null;
let _multiCloseMovements = [];
let _editPaymentInvId = null;
let _editPaymentInvType = null;
let _editPaymentIdx = null;

let _selectedArchiveDocsA = new Set();
let _selectedArchiveDocsP = new Set();
let _selectedArchiveMovs = new Set();

// ======================== UTILS ========================
function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function round2(n) { return Math.round((parseFloat(n) || 0) * 100) / 100; }
function fmt(n) { return (parseFloat(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function today() { return new Date().toISOString().split('T')[0]; }
function toBase64(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
function toast(msg, type) {
  if (!type) type = 'info';
  const d = document.createElement('div');
  d.className = 'toast toast-' + type;
  d.textContent = msg;
  document.getElementById('toasts').appendChild(d);
  setTimeout(function() { d.remove(); }, 4500);
}
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ======================== AGGIUNTA STILI DINAMICI ========================
(function addCustomStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .iva-line .iva-imp { width: 130px !important; }
    .modal-content { width: 90%; max-width: 1100px; }
    #rec-filter-input { width: 100%; padding: 8px; margin-bottom: 12px; }
    .link-mov-filter { width: 100%; padding: 8px; margin-bottom: 16px; border: 1px solid #ccc; border-radius: 6px; }
  `;
  document.head.appendChild(style);
})();

// ======================== PREFERENZE ========================
function loadPreferences() {
  const savedSort = localStorage.getItem('fmp_sortS');
  if (savedSort) sortS = JSON.parse(savedSort);
  const savedArchiveSort = localStorage.getItem('fmp_sortArchive');
  if (savedArchiveSort) sortArchive = JSON.parse(savedArchiveSort);
}
function savePreferences() {
  localStorage.setItem('fmp_sortS', JSON.stringify(sortS));
  localStorage.setItem('fmp_sortArchive', JSON.stringify(sortArchive));
}

// ======================== COLONNE ========================
const COLS = [
  { k: '_dot', l: '●', sort: false, w: '28px' },
  { k: 'tipo', l: 'Tipo', sort: true },
  { k: 'rs', l: 'Ragione Sociale', sort: true },
  { k: 'num', l: 'N. Fattura', sort: true },
  { k: 'data', l: 'Data', sort: true },
  { k: 'scad', l: 'Scadenza', sort:true },
  { k: 'imp', l: 'Imponibile', sort: true },
  { k: 'aliq', l: 'IVA %', sort: false },
  { k: 'totiva', l: 'Tot. IVA', sort: true },
  { k: 'tot', l: 'Totale', sort: true },
  { k: 'valuta', l: 'Valuta', sort: true },
  { k: '_pagamenti', l: 'Pagamenti', sort: false },
  { k: 'res', l: 'Residuo', sort: true },
  { k: '_pdf', l: 'PDF', sort: false },
  { k: '_act', l: '', sort: false }
];

const COLS_MOV = [
  { k: '_dot', l: '●', sort: false, w: '28px' },
  { k: 'data', l: 'Data', sort: true },
  { k: 'descrizione', l: 'Descrizione', sort: false },
  { k: 'entrata', l: 'Entrata (€)', sort: true },
  { k: 'uscita', l: 'Uscita (€)', sort: true },
  { k: 'riconciliato', l: 'Riconciliato', sort: true },
  { k: 'residuo', l: 'Residuo', sort: true },
  { k: 'banca', l: 'Banca', sort: true },
  { k: '_links', l: 'Abbinamenti', sort: false },
  { k: '_act', l: '', sort: false }
];

// ======================== METODI DI PAGAMENTO ========================
const MOD_BASE = { '': '—', bonifico: 'Bonifico', contanti: 'Contanti', assegno: 'Assegno', carta: 'Carta', rid: 'RID/SDD', riba: 'Ri.Ba.', paypal: 'PayPal', altro: 'Altro', nota_credito: 'Nota di Credito' };
function getMOD() { const m = Object.assign({}, MOD_BASE); (S.customMods || []).forEach(function(c) { m[c.id] = c.label; }); return m; }
function modLabel(k) { return getMOD()[k] || String(k || '—'); }
// v2.22: versione già protetta per l'inserimento in HTML (le etichette personalizzate sono testo libero)
function modLabelHtml(k) { return esc(modLabel(k)); }
// v2.22: testo da inserire dentro una stringa JS in un attributo onclick="...('<qui>')". esc() da solo
// non basta: il browser decodifica &#39; in ' PRIMA di eseguire il JS, quindi un nome con apostrofo
// (es. Dell'Acqua) chiudeva la stringa e rompeva il pulsante.
function jsq(s) { return esc(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ')); }
function modOptions(sel) {
  if (sel === undefined) sel = '';
  return Object.entries(getMOD()).map(function(entry) {
    var k = entry[0], v = entry[1];
    return '<option value="' + esc(k) + '"' + (k === sel ? 'selected' : '') + '>' + esc(v) + '</option>';
  }).join('');
}

function refreshModSelects() {
  var filterOpts = Object.entries(getMOD()).filter(function(entry) { return entry[0] !== ''; }).map(function(entry) {
    return '<option value="' + esc(entry[0]) + '">' + esc(entry[1]) + '</option>';
  }).join('');
  ['fmod-a', 'fmod-p', 'fmod-arch-a', 'fmod-arch-p'].forEach(function(id) {
    var el = document.getElementById(id); if (!el) return;
    var cur = el.value;
    el.innerHTML = '<option value="">Tutti i metodi</option>' + filterOpts;
    el.value = cur;
  });
  var formOpts = Object.entries(getMOD()).map(function(entry) {
    return '<option value="' + esc(entry[0]) + '">' + esc(entry[1]) + '</option>';
  }).join('');
  var fmod = document.getElementById('f-modpag'); if (fmod) { var cur = fmod.value; fmod.innerHTML = formOpts; fmod.value = cur; }
}

// ======================== GESTIONE BANCHE ========================
function initBanche() {
  if (!S.banche || !S.banche.length) {
    S.banche = [{ id: 'default', nome: 'Banca Principale' }];
  }
  (S.movimenti || []).forEach(function(m) {
    if (!m.bancaId) m.bancaId = 'default';
  });
  (S.archive && S.archive.movimenti || []).forEach(function(m) {
    if (!m.bancaId) m.bancaId = 'default';
  });
}
function openBancheModal() {
  renderBancheList();
  openModal('m-banche');
}
function renderBancheList() {
  var container = document.getElementById('banche-list');
  if (!container) return;
  if (!S.banche.length) {
    container.innerHTML = '<div style="color:#a8a29e">Nessuna banca definita.</div>';
    return;
  }
  container.innerHTML = S.banche.map(function(b) {
    return '<div class="mod-custom-row"><span>' + esc(b.nome) + '</span><button class="ico" style="color:#dc2626" onclick="deleteBanca(\'' + b.id + '\')">🗑️</button></div>';
  }).join('');
}
function saveNuovaBanca() {
  var nome = document.getElementById('new-banca-nome').value.trim();
  if (!nome) { toast('Inserisci il nome della banca', 'error'); return; }
  var id = 'banca_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  S.banche.push({ id: id, nome: nome });
  save();
  renderBancheList();
  aggiornaSelectBanche();
  document.getElementById('new-banca-nome').value = '';
  toast('✅ Banca "' + nome + '" aggiunta', 'success');
}
function deleteBanca(id) {
  if (S.banche.length === 1) { toast('Devi avere almeno una banca', 'warn'); return; }
  var movCollegati = S.movimenti.some(function(m) { return m.bancaId === id; }) || (S.archive && S.archive.movimenti || []).some(function(m) { return m.bancaId === id; });
  if (movCollegati && !confirm('Ci sono movimenti associati a questa banca. Spostarli sulla banca principale?')) return;
  if (movCollegati) {
    var defaultId = S.banche.find(function(b) { return b.id !== id; }).id;
    S.movimenti.forEach(function(m) { if (m.bancaId === id) m.bancaId = defaultId; });
    if (S.archive) S.archive.movimenti.forEach(function(m) { if (m.bancaId === id) m.bancaId = defaultId; });
  }
  S.banche = S.banche.filter(function(b) { return b.id !== id; });
  save();
  renderBancheList();
  aggiornaSelectBanche();
  renderMov(); renderArchiveMovs();
  toast('🗑️ Banca eliminata', 'info');
}
function aggiornaSelectBanche() {
  var opts = '<option value="">Tutte le banche</option>' + S.banche.map(function(b) { return '<option value="' + b.id + '">' + esc(b.nome) + '</option>'; }).join('');
  var selectFiltro = document.getElementById('f-banca-m');
  if (selectFiltro) selectFiltro.innerHTML = opts;
  var selectMovForm = document.getElementById('mov-banca');
  if (selectMovForm) {
    selectMovForm.innerHTML = S.banche.map(function(b) { return '<option value="' + b.id + '">' + esc(b.nome) + '</option>'; }).join('');
    if (S.banche.length) selectMovForm.value = S.banche[0].id;
  }
  var selectCsv = document.getElementById('csv-banca');
  if (selectCsv) {
    selectCsv.innerHTML = S.banche.map(function(b) { return '<option value="' + b.id + '">' + esc(b.nome) + '</option>'; }).join('');
    if (S.banche.length) selectCsv.value = S.banche[0].id;
  }
  var archFiltro = document.getElementById('f-banca-arch-m');
  if (archFiltro) archFiltro.innerHTML = opts;
}

// ======================== METODI DI PAGAMENTO (MODALE) ========================
function openModsModal() {
  renderModsList();
  openModal('m-mods');
}
function renderModsList() {
  var baseContainer = document.getElementById('mods-base-list');
  var customContainer = document.getElementById('mods-custom-list');
  if (!baseContainer || !customContainer) return;
  var baseMods = Object.entries(MOD_BASE).filter(function(entry) { return entry[0] !== ''; });
  baseContainer.innerHTML = '<div class="rec-section-lbl">Metodi predefiniti</div>' +
    baseMods.map(function(entry) { return '<div class="mod-custom-row"><span>' + esc(entry[1]) + '</span></div>'; }).join('');
  var customMods = S.customMods || [];
  customContainer.innerHTML = '<div class="rec-section-lbl">Metodi personalizzati</div>' +
    (customMods.length ? customMods.map(function(c) {
      return '<div class="mod-custom-row"><span>' + esc(c.label) + '</span><button class="ico" style="color:#dc2626" onclick="deleteCustomMod(\'' + c.id + '\')">🗑️</button></div>';
    }).join('') : '<div style="color:#a8a29e; padding: 0.5rem;">Nessun metodo personalizzato</div>');
}
function saveNewMod() {
  var label = document.getElementById('new-mod-label').value.trim();
  if (!label) { toast('Inserisci un nome per il metodo', 'error'); return; }
  var id = 'mod_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  S.customMods.push({ id: id, label: label });
  save();
  renderModsList();
  refreshModSelects();
  document.getElementById('new-mod-label').value = '';
  toast('✅ Metodo "' + label + '" aggiunto', 'success');
}
function deleteCustomMod(id) {
  S.customMods = S.customMods.filter(function(c) { return c.id !== id; });
  save();
  renderModsList();
  refreshModSelects();
  toast('🗑️ Metodo eliminato', 'info');
}

// ======================== CASSA CONTANTI ========================
function aggiornaCassa(importo, tipo, descrizione, riferimento, data) {
  if (!S.cassa) S.cassa = { saldo: 0, movimenti: [] };
  var segno = tipo === 'entrata' ? 1 : -1;
  var dataMov = data || today();
  var movimento = { id: uid(), data: dataMov, descrizione: descrizione, importo: importo * segno, riferimento: riferimento };
  S.cassa.movimenti.push(movimento);
  S.cassa.saldo += movimento.importo;
  save();
  aggiornaUICassa();
  return movimento.id;
}
function toggleCassaSection() {
  var body = document.getElementById('cassa-body');
  if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
}
function refreshCassa() {
  var saldoEl = document.getElementById('cassa-saldo');
  if (saldoEl) saldoEl.textContent = '€ ' + fmt(S.cassa ? S.cassa.saldo : 0);
  var tbody = document.getElementById('cassa-movimenti');
  if (!tbody) return;
  var movimenti = (S.cassa ? S.cassa.movimenti : []).filter(function(m) { return typeof m.importo === 'number'; });
  if (!movimenti.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Nessun movimento di cassa</td></tr>';
    return;
  }
  var sorted = movimenti.slice().sort(function(a, b) { return (b.data || '').localeCompare(a.data || ''); });
  tbody.innerHTML = sorted.map(function(m) {
    return '<tr><td>' + (m.data ? m.data.split('-').reverse().join('/') : '—') + '</td><td>' + esc(m.descrizione) + '</td><td class="num ' + (m.importo > 0 ? 'text-green' : 'text-red') + '">' + (m.importo > 0 ? '+' : '') + '€ ' + fmt(Math.abs(m.importo)) + '</td></tr>';
  }).join('');
}
function aggiornaUICassa() { refreshCassa(); }
function ricostruisciCassa() {
  // v2.22: prima i flag venivano cancellati PRIMA della conferma (dati modificati anche annullando)
  // e la ricostruzione perdeva prelievi manuali e versamenti cassa→banca e rigenerava tutti gli id,
  // rompendo i collegamenti m.riconciliazioniCassa. Ora: conferma prima, movimenti manuali e da
  // versamento mantenuti, id e collegamenti riusati quando il movimento ricalcolato coincide.
  if (!confirm('ATTENZIONE: la cassa contanti verrà ricostruita dai dati correnti (pagamenti in contanti + chiusure forzate con flag cassa). Prelievi manuali e versamenti in banca vengono mantenuti. Procedere?')) return;
  var esistenti = (S.cassa && S.cassa.movimenti) || [];
  var idsFatture = new Set(S.a.concat(S.p).map(function(i) { return i.id; }));
  var idsChiusure = new Set();
  S.movimenti.forEach(function(mov) { (mov.chiusureExtra || []).forEach(function(ch) { if (ch.idCassa) idsChiusure.add(ch.idCassa); }); });
  // Movimenti non derivati da fatture/chiusure: prelievi manuali, versamenti generati, altro.
  var mantenuti = esistenti.filter(function(c) {
    if (c.generatoDaVersamento) return true;
    if (idsChiusure.has(c.id)) return false;
    return !(c.riferimento && idsFatture.has(c.riferimento));
  });
  var riusabili = esistenti.filter(function(c) { return mantenuti.indexOf(c) === -1; });
  function prendiEsistente(riferimento, importo, data) {
    var idx = riusabili.findIndex(function(c) { return c.riferimento === riferimento && Math.abs(c.importo - importo) < 0.005 && c.data === data; });
    if (idx === -1) return null;
    return riusabili.splice(idx, 1)[0];
  }
  function aggiungi(nuovo) {
    var old = prendiEsistente(nuovo.riferimento, nuovo.importo, nuovo.data);
    // Riusa id e flag di collegamento (riconciliatoConMovId, usatoPerVersamento...) se coincide.
    nuoviMovimenti.push(old ? Object.assign({}, old, { descrizione: nuovo.descrizione }) : nuovo);
  }
  var nuoviMovimenti = [];
  S.a.forEach(function(inv) {
    (inv.pagamenti || []).forEach(function(pag) {
      if (pag.mod === 'contanti' && !pag._movId) {
        aggiungi({ id: uid(), data: pag.data, descrizione: 'Incasso fattura ' + inv.num + ' - ' + inv.rs, importo: pag.importo, riferimento: inv.id });
      }
    });
  });
  S.p.forEach(function(inv) {
    (inv.pagamenti || []).forEach(function(pag) {
      if (pag.mod === 'contanti' && !pag._movId) {
        aggiungi({ id: uid(), data: pag.data, descrizione: 'Pagamento fattura ' + inv.num + ' - ' + inv.rs, importo: -pag.importo, riferimento: inv.id });
      }
    });
  });
  S.movimenti.forEach(function(mov) {
    (mov.chiusureExtra || []).forEach(function(ch) {
      if (ch.aggiornaCassa === true && ch.mod === 'contanti') {
        var tipoCassa = mov.uscita > 0 ? 'entrata' : 'uscita';
        var segno = tipoCassa === 'entrata' ? 1 : -1;
        var descrizione = (tipoCassa === 'entrata' ? 'Prelievo' : 'Versamento') + ' contanti: ' + (ch.nota || mov.descrizione);
        if (!ch.idCassa) ch.idCassa = uid();
        nuoviMovimenti.push({ id: ch.idCassa, data: ch.data || mov.data, descrizione: descrizione, importo: round2(ch.imp * segno), riferimento: mov.id });
      }
    });
  });
  nuoviMovimenti = nuoviMovimenti.concat(mantenuti);
  var saldo = nuoviMovimenti.reduce(function(s, c) { return s + (c.importo || 0); }, 0);
  S.cassa = { saldo: round2(saldo), movimenti: nuoviMovimenti.sort(function(a, b) { return (a.data || '').localeCompare(b.data || ''); }) };
  save(); refreshCassa();
  toast('✅ Cassa contanti ricostruita', 'success');
}

function prelievoContanti() {
  const importo = prompt('Inserisci l\'importo del prelievo (€):', '0');
  if (importo === null) return;
  const importoNum = parseFloat(importo);
  if (isNaN(importoNum) || importoNum <= 0) {
    toast('Importo non valido', 'error');
    return;
  }
  const nota = prompt('Descrizione (es. Versamento banca):', 'Prelievo per versamento');
  if (nota === null) return;
  const descrizione = nota.trim() || 'Prelievo contanti';
  aggiornaCassa(importoNum, 'uscita', descrizione, null, today());
  refreshCassa();
  toast(`💰 Prelievo contanti di € ${fmt(importoNum)} registrato`, 'success');
}

function movimentiCassaRiconciliabili(isEntrataBancaria) {
  if (!S.cassa || !S.cassa.movimenti) return [];
  if (isEntrataBancaria) {
    return S.cassa.movimenti.filter(m => {
      if (m.importo < 0 && !m.riconciliatoConMovId) return true;
      if (m.importo > 0 && !m.usatoPerVersamento && !m.riconciliatoConMovId) return true;
      return false;
    });
  } else {
    return S.cassa.movimenti.filter(m => m.importo > 0 && !m.riconciliatoConMovId);
  }
}

function creaUscitaCassaDaVersamento(movCassaEntrata, importo, data, riferimento) {
  var descrizione = 'Versamento in banca di € ' + fmt(importo) + ' (da: ' + movCassaEntrata.descrizione + ')';
  var idUscita = aggiornaCassa(importo, 'uscita', descrizione, riferimento, data);
  var nuovoMov = S.cassa.movimenti.find(m => m.id === idUscita);
  if (nuovoMov) {
    nuovoMov.generatoDaVersamento = true;
    nuovoMov.parenteEntrataId = movCassaEntrata.id;
  }
  movCassaEntrata.usatoPerVersamento = true;
  save();
  return idUscita;
}

// v2.22: annulla un collegamento movimento bancario ↔ cassa. Se l'uscita di cassa era stata
// generata automaticamente da un versamento cassa→banca, viene eliminata e l'entrata di cassa
// d'origine torna disponibile (prima restavano l'uscita orfana e il flag usatoPerVersamento).
function annullaCollegamentoCassa(c) {
  var cassaMov = (S.cassa.movimenti || []).find(function(cm) { return cm.id === c.id; });
  if (!cassaMov) return;
  if (cassaMov.generatoDaVersamento) {
    var parentId = cassaMov.parenteEntrataId;
    S.cassa.movimenti = S.cassa.movimenti.filter(function(cm) { return cm.id !== cassaMov.id; });
    var altriVersamenti = S.cassa.movimenti.some(function(cm) { return cm.generatoDaVersamento && cm.parenteEntrataId === parentId; });
    var parent = S.cassa.movimenti.find(function(cm) { return cm.id === parentId; });
    if (parent && !altriVersamenti) delete parent.usatoPerVersamento;
  } else {
    delete cassaMov.riconciliatoConMovId;
    delete cassaMov.riconciliatoImp;
  }
  S.cassa.saldo = round2(S.cassa.movimenti.reduce(function(s, cm) { return s + cm.importo; }, 0));
}

// ======================== MOVIMENTI BANCARI ========================
function buildTH_M() {
  var col = sortS.m.col, dir = sortS.m.dir;
  var th = document.getElementById('th-m');
  if (!th) return;
  th.innerHTML = COLS_MOV.map(function(c) {
    var arrow = '';
    if (c.sort) {
      arrow = '<span class="sort-arrow">' + (c.k === col ? (dir === 'asc' ? '▲' : '▼') : '↕') + '</span>';
    }
    return '<th class="' + (c.k === col ? 'sorted' : '') + '" style="' + (c.w ? 'width:' + c.w : '') + '" onclick="' + (c.sort ? 'doSortM(\'' + c.k + '\')' : '') + '" >' + c.l + arrow + '</th>';
  }).join('');
}
function doSortM(col) {
  if (sortS.m.col === col) sortS.m.dir = sortS.m.dir === 'asc' ? 'desc' : 'asc';
  else { sortS.m.col = col; sortS.m.dir = 'asc'; }
  renderMov();
}
function movTotale(m) { return round2((m.entrata || 0) + (m.uscita || 0)); }
function movRicTotale(m) {
  var daDocumenti = (m.riconciliazioni || []).reduce(function(s, r) { return s + (r.imp || 0); }, 0);
  var daChiusure = (m.chiusureExtra || []).reduce(function(s, c) { return s + (c.imp || 0); }, 0);
  var daCassa = (m.riconciliazioniCassa || []).reduce(function(s, c) { return s + (c.imp || 0); }, 0);
  return round2(daDocumenti + daChiusure + daCassa);
}
function movResiduo(m) {
  var res = round2(Math.max(0, movTotale(m) - movRicTotale(m)));
  return res < 0.005 ? 0 : res;
}
function movStatus(m) {
  var res = movResiduo(m), hasExtra = (m.chiusureExtra || []).length > 0;
  if (res <= 0) return hasExtra ? 'forzato' : 'ok';
  if (movRicTotale(m) > 0) return 'par';
  return 'no';
}
var EXTRA_CAT = {
  commissioni: 'Commissioni bancarie', f24: 'F24 / Tasse e imposte',
  stipendio: 'Stipendi e compensi', affitto: 'Affitto / Locazione',
  mutuo: 'Mutuo / Finanziamento', utenze: 'Utenze (luce, gas, tel.)',
  assicurazione: 'Assicurazione', altro: 'Altro'
};
function linkify(text) {
  if (!text) return '';
  var linked = text.replace(/\b([A-Z]{2}\d{2}[A-Z0-9]{10,30})\b/g, '<a href="#" onclick="navigator.clipboard.writeText(\'$1\'); toast(\'IBAN copiato\',\'info\'); return false;">$1</a>');
  linked = linked.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
  return linked;
}
function renderMov() {
  buildTH_M();
  var q = (document.getElementById('srch-m') || { value: '' }).value.toLowerCase();
  var da = (document.getElementById('fda-m') ? document.getElementById('fda-m').value : '');
  var db = (document.getElementById('fdb-m') ? document.getElementById('fdb-m').value : '');
  var ftip = (document.getElementById('ftip-m') ? document.getElementById('ftip-m').value : '');
  var frec = (document.getElementById('frec-m') ? document.getElementById('frec-m').value : '');
  var bancaFiltro = (document.getElementById('f-banca-m') ? document.getElementById('f-banca-m').value : '');
  var col = sortS.m.col, dir = sortS.m.dir;
  var data = (S.movimenti || []).filter(function(m) {
    if (q && !(m.descrizione || '').toLowerCase().includes(q)) return false;
    if (da && (m.data || '') < da) return false;
    if (db && (m.data || '') > db) return false;
    if (ftip === 'e' && !(m.entrata > 0)) return false;
    if (ftip === 'u' && !(m.uscita > 0)) return false;
    if (frec && movStatus(m) !== frec) return false;
    if (bancaFiltro && m.bancaId !== bancaFiltro) return false;
    return true;
  });
  data.sort(function(a, b) {
    var av, bv;
    if (col === 'residuo') { av = movResiduo(a); bv = movResiduo(b); }
    else if (col === 'entrata') { av = a.entrata || 0; bv = b.entrata || 0; }
    else if (col === 'uscita') { av = a.uscita || 0; bv = b.uscita || 0; }
    else if (col === 'riconciliato') { av = movRicTotale(a); bv = movRicTotale(b); }
    else if (col === 'banca') {
      var bancaA = (S.banche.find(function(b) { return b.id === a.bancaId; }) || {}).nome || '';
      var bancaB = (S.banche.find(function(x) { return x.id === b.bancaId; }) || {}).nome || '';
      av = bancaA; bv = bancaB;
    }
    else { av = a[col] || ''; bv = b[col] || ''; }
    if (typeof av === 'number') return (av - bv) * (dir === 'asc' ? 1 : -1);
    return String(av).localeCompare(String(bv)) * (dir === 'asc' ? 1 : -1);
  });
  var tot = S.movimenti.length;
  var countEl = document.getElementById('fcount-m');
  if (countEl) countEl.textContent = tot === 0 ? '' : (data.length < tot ? data.length + ' di ' + tot : tot + ' movimenti');
  var tb = document.getElementById('tb-m');
  if (!tb) return;
  if (!data.length) {
    tb.innerHTML = '<tr><td colspan="' + COLS_MOV.length + '" class="empty-state"><span class="ei">🏦</span>Nessun movimento. Carica un CSV bancario o aggiungi manualmente.</td></tr>';
    document.getElementById('tf-m').innerHTML = '';
    return;
  }
  tb.innerHTML = data.map(function(m) { return rowMov(m); }).join('');
  var te = round2(data.filter(function(m) { return m.entrata > 0; }).reduce(function(s, m) { return s + m.entrata; }, 0));
  var tu = round2(data.filter(function(m) { return m.uscita > 0; }).reduce(function(s, m) { return s + m.uscita; }, 0));
  var tr2 = round2(data.reduce(function(s, m) { return s + movRicTotale(m); }, 0));
  var tres = round2(data.reduce(function(s, m) { return s + movResiduo(m); }, 0));
  var count = data.length;
  var cells = [
    '',   // _dot
    '',   // data
    '<span class="tf-lbl">Movimenti</span><span class="tf-val tf-n">' + count + '</span>',
    '<span class="tf-lbl">Tot. Entrate</span><span class="tf-val" style="color:#4ade80">€ ' + fmt(te) + '</span>',
    '<span class="tf-lbl">Tot. Uscite</span><span class="tf-val" style="color:#fca5a5">€ ' + fmt(tu) + '</span>',
    '<span class="tf-lbl">Riconciliato</span><span class="tf-val">€ ' + fmt(tr2) + '</span>',
    '<span class="tf-lbl">Residuo</span><span class="tf-val" style="color:#fde68a">€ ' + fmt(tres) + '</span>',
    '',   // banca
    '',   // _links
    ''    // _act
  ];
  var tf = document.getElementById('tf-m');
  if (tf) tf.innerHTML = '<tr>' + cells.map(function(c) { return '<td class="num">' + c + '</td>'; }).join('') + '</tr>';
}
function rowMov(m) {
  var st = movStatus(m);
  var dotCls = { ok: 'dot-g', par: 'dot-y', no: 'dot-r', forzato: 'dot-b' }[st] || 'dot-r';
  var res = movResiduo(m);
  var isIn = m.entrata > 0;
  var nomeBanca = (S.banche.find(function(b) { return b.id === m.bancaId; }) || {}).nome || '—';
  var recLinks = (m.riconciliazioni || []).map(function(r) {
    var inv = (S[r.t] || []).find(function(i) { return i.id === r.id; });
    return '<div class="rec-link"><span class="rl-rs" title="' + (inv ? esc(inv.rs) : r.id) + '">' + (inv ? esc(inv.rs.slice(0, 20)) : r.id) + '</span><span class="rl-amt">€ ' + fmt(r.imp) + '</span></div>';
  });
  var extraLinks = (m.chiusureExtra || []).map(function(c) {
    return '<div class="rec-link"><span class="rl-rs" title="' + esc(c.nota || '') + '">' + esc((EXTRA_CAT[c.categoria] || c.categoria || 'Extra').slice(0, 18)) + '</span><span class="rl-amt">€ ' + fmt(c.imp) + '</span></div>';
  });
  var cassaLinks = (m.riconciliazioniCassa || []).map(function(c) {
    return '<div class="rec-link"><span class="rl-rs" title="Prelievo cassa">💰 ' + esc(c.descrizione || 'Prelievo cassa') + '</span><span class="rl-amt">€ ' + fmt(c.imp) + '</span></div>';
  });
  var tuttiLinks = recLinks.concat(extraLinks).concat(cassaLinks);
  var linksHtml = tuttiLinks.length ? '<div class="rec-links">' + tuttiLinks.join('') + '</div>' : '<span style="color:#a8a29e;font-size:.78rem">—</span>';
  var resBadge = res <= 0 ? '<span class="res res-0">✓</span>' : '<span class="res ' + (isIn ? '' : 'res-pos') + '">€ ' + fmt(res) + '</span>';
  var descLinked = linkify(esc(m.descrizione));
  var statusTitle = { ok: 'Riconciliato', par: 'Parziale', no: 'Da riconciliare', forzato: 'Chiuso forzatamente' }[st];
  return '<tr class="' + (isIn ? 'mov-in' : 'mov-out') + '">' +
    '<td style="text-align:center"><span class="dot ' + dotCls + '" title="' + statusTitle + '"></span></td>' +
    '<td style="white-space:nowrap">' + (m.data ? m.data.split('-').reverse().join('/') : '—') + '</td>' +
    '<td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem" title="' + esc(m.descrizione) + '">' + descLinked + '</td>' +
    '<td class="num">' + (isIn ? '€ ' + fmt(m.entrata) : '—') + '</td>' +
    '<td class="num">' + (m.uscita > 0 ? '€ ' + fmt(m.uscita) : '—') + '</td>' +
    '<td class="num">€ ' + fmt(movRicTotale(m)) + '</td>' +
    '<td class="num">' + resBadge + '</td>' +
    '<td class="num">' + esc(nomeBanca) + '</td>' +
    '<td>' + linksHtml + '</td>' +
    '<td><div style="display:flex;gap:.1rem;justify-content:flex-end"><button class="ico" style="color:#2563eb" title="' + (res > 0 ? 'Riconcilia' : 'Modifica riconciliazione') + '" onclick="openRec(\'' + m.id + '\')">🔗</button><button class="ico" title="Elimina" onclick="delMov(\'' + m.id + '\')">🗑️</button></div></td>' +
    '</tr>';
}
function delMov(id) {
  if (!confirm('Eliminare questo movimento? Le riconciliazioni collegate verranno annullate.')) return;
  var m = S.movimenti.find(function(x) { return x.id === id; });
  if (!m) return;
  (m.riconciliazioniCassa || []).forEach(annullaCollegamentoCassa);
  (m.chiusureExtra || []).forEach(function(ch) {
    if (ch.aggiornaCassa && ch.idCassa) {
      S.cassa.movimenti = S.cassa.movimenti.filter(function(c) { return c.id !== ch.idCassa; });
    }
  });
  S.cassa.saldo = round2(S.cassa.movimenti.reduce(function(s, c) { return s + c.importo; }, 0));
  (m.riconciliazioni || []).forEach(function(r) {
    var inv = (S[r.t] || []).find(function(i) { return i.id === r.id; });
    if (!inv) return;
    inv.pagamenti = (inv.pagamenti || []).filter(function(p) { return p._movId !== id; });
    inv.pagato = round2(Math.max(0, (inv.pagato || 0) - (r.imp || 0)));
  });
  S.movimenti = S.movimenti.filter(function(x) { return x.id !== id; });
  save(); render('a'); render('p'); renderMov(); refreshCassa();
  toast('🗑️ Movimento eliminato', 'info');
}
function clearFilterMov() {
  ['srch-m', 'fda-m', 'fdb-m'].forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
  ['ftip-m', 'frec-m'].forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
  var bancaFilter = document.getElementById('f-banca-m');
  if (bancaFilter) bancaFilter.value = '';
  renderMov();
}

// ======================== FUNZIONI PER LA RICONCILIAZIONE ========================
function getCandidatesForMovement(m) {
  var isOutflow = m.uscita > 0;
  var docType = isOutflow ? 'p' : 'a';
  var candidates = [];
  S[docType].forEach(function(doc) {
    var residuoDoc = residuo(doc); // v2.23: al netto di ritenuta e IVA split
    if (residuoDoc <= 0.005) return;
    candidates.push({
      doc: doc,
      type: docType,
      residuo: residuoDoc,
      isCredito: doc.tipo === 'nota_credito'
    });
  });
  candidates.sort(function(a, b) {
    if (a.isCredito !== b.isCredito) return a.isCredito ? 1 : -1;
    return (a.doc.data || '').localeCompare(b.doc.data || '');
  });
  return candidates;
}
function openRec(movId) {
  var m = S.movimenti.find(function(x) { return x.id === movId; });
  if (!m) return;
  _recMovId = movId;
  _recSelections = {};
  _recCandidateScores = {};
  renderRecModal(m);
  openModal('m-rec');
}

function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  var matrix = [];
  for (var i = 0; i <= b.length; i++) matrix[i] = [i];
  for (var j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (var i = 1; i <= b.length; i++) {
    for (var j = 1; j <= a.length; j++) {
      var cost = (a[j-1] === b[i-1]) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i-1][j] + 1,
        matrix[i][j-1] + 1,
        matrix[i-1][j-1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}
function similarity(a, b) {
  if (a.length === 0 && b.length === 0) return 1;
  var dist = levenshtein(a, b);
  var maxLen = Math.max(a.length, b.length);
  return 1 - (dist / maxLen);
}
// Forme societarie: troppo generiche per contare come segnale di identità di un'azienda
// (es. "srl" compare in centinaia di ragioni sociali diverse) — vanno escluse dal conteggio
// delle parole significative, altrimenti gonfiano artificialmente la copertura del match.
var LEGAL_FORM_TOKENS = { srl: 1, srls: 1, spa: 1, snc: 1, sas: 1, sapa: 1, coop: 1, soc: 1, ditta: 1, di: 1, e: 1, c: 1, service: 1, servizi: 1, italia: 1, gruppo: 1, group: 1 };
function meaningfulWords(normStr) {
  return normStr.split(/\s+/).filter(function(w) { return w.length > 2 && !LEGAL_FORM_TOKENS[w]; });
}
// Cerca la miglior somiglianza tra `needle` (es. ragione sociale normalizzata) e QUALUNQUE
// porzione di `haystack` di lunghezza comparabile, invece di confrontare le due stringhe intere:
// una descrizione di 60 caratteri contro un nome di 15 ha una similarity Levenshtein bassissima
// anche quando il nome compare per intero al suo interno, perché la distanza è normalizzata
// sulla lunghezza massima delle due stringhe.
function fuzzyContains(haystack, needle) {
  if (!needle) return 0;
  if (haystack.length <= needle.length) return similarity(haystack, needle);
  var best = 0;
  var step = Math.max(1, Math.floor(needle.length / 4));
  for (var i = 0; i <= haystack.length - needle.length; i += step) {
    var sim = similarity(haystack.substr(i, needle.length), needle);
    if (sim > best) best = sim;
    if (best > 0.95) break;
  }
  return best;
}
// Distanza in giorni tra due date 'AAAA-MM-DD'. Usata nel matching: fornitori come gli hotel
// fatturano quasi sempre a ridosso del pagamento, quindi la vicinanza tra data fattura e data
// movimento è un segnale utile, specie per distinguere quale fattura di un fornitore ricorrente
// (stesso nome, più fatture aperte) corrisponde davvero a questo movimento.
function daysBetween(d1, d2) {
  if (!d1 || !d2) return 9999;
  var t1 = new Date(d1 + 'T00:00:00').getTime();
  var t2 = new Date(d2 + 'T00:00:00').getTime();
  if (isNaN(t1) || isNaN(t2)) return 9999;
  return Math.round(Math.abs(t1 - t2) / 86400000);
}

function renderRecModal(m) {
  if (!m) return;
  var isOutflow = (parseFloat(m.uscita) || 0) > 0;
  var movAmt = isOutflow ? parseFloat(m.uscita) : parseFloat(m.entrata);
  var residuoMov = movResiduo(m);
  var recInfo = document.getElementById('rec-info');
  if (recInfo) {
    var dataStr = m.data ? m.data.split('-').reverse().join('/') : '';
    recInfo.textContent = dataStr + ' · ' + m.descrizione + ' · ' + (isOutflow ? 'Uscita' : 'Entrata') + ' € ' + fmt(movAmt) + ' (residuo € ' + fmt(residuoMov) + ')';
  }

  var existingHtml = '';
  if ((m.riconciliazioni && m.riconciliazioni.length) || (m.chiusureExtra && m.chiusureExtra.length) || (m.riconciliazioniCassa && m.riconciliazioniCassa.length)) {
    existingHtml = '<div class="rec-section-lbl">Già abbinati (clicca 🗑️ per rimuovere)</div>';
    existingHtml += (m.riconciliazioni || []).map(function(r, idx) {
      var inv = (S[r.t] || []).find(function(i) { return i.id === r.id; });
      var archived = false;
      if (!inv) {
        inv = (S.archive && S.archive.docs || []).find(function(d) { return d.id === r.id && d._originalType === r.t; });
        archived = !!inv;
      }
      var label = inv ? esc(inv.rs) + (archived ? ' <span style="font-size:.68rem;color:#78716c">(in archivio)</span>' : '') : '(documento non trovato)';
      return '<div class="rec-existing"><span class="re-rs">' + label + '</span><span class="re-num">' + (inv ? esc(inv.num) : '') + '</span><span class="re-mod">' + modLabelHtml(r.mod) + '</span><span class="re-amt">€ ' + fmt(r.imp) + '</span><button class="ico" style="color:#dc2626;font-size:.82rem" onclick="deleteRecLink(\'' + m.id + '\',\'' + r.t + '\',\'' + r.id + '\',' + idx + ')">🗑️</button></div>';
    }).join('');
    existingHtml += (m.chiusureExtra || []).map(function(c, idx) {
      return '<div class="rec-existing"><span class="re-rs">' + esc(EXTRA_CAT[c.categoria] || c.categoria || 'Extra') + '</span><span class="re-num">' + esc(c.nota || '') + '</span><span class="re-mod">' + modLabelHtml(c.mod) + '</span><span class="re-amt">€ ' + fmt(c.imp) + '</span><button class="ico" style="color:#dc2626;font-size:.82rem" onclick="deleteChiusuraExtra(\'' + m.id + '\',' + idx + ')">🗑️</button></div>';
    }).join('');
    existingHtml += (m.riconciliazioniCassa || []).map(function(c, idx) {
      return '<div class="rec-existing"><span class="re-rs">💰 Prelievo cassa</span><span class="re-num">' + esc(c.descrizione || '') + '</span><span class="re-mod">contanti</span><span class="re-amt">€ ' + fmt(c.imp) + '</span><button class="ico" style="color:#dc2626;font-size:.82rem" onclick="deleteCassaLink(\'' + m.id + '\',' + idx + ')">🗑️</button></div>';
    }).join('');
    existingHtml += '<hr style="margin:.6rem 0;border-color:#e5e3dc">';
  }

  var candidates = getCandidatesForMovement(m);
  var candidatesHtml = '';
  if (residuoMov > 0) {
    candidatesHtml = '<div class="rec-section-lbl">Seleziona documenti da abbinare (fatture e note di credito)</div>';
    if (candidates.length === 0) {
      candidatesHtml += '<div style="color:#a8a29e;font-size:.84rem;padding:.5rem 0">Nessun documento con residuo disponibile. Usa la chiusura forzata sotto.</div>';
    } else {
      candidatesHtml += '<div style="margin-bottom: 0.75rem;"><input type="text" id="rec-filter-input" class="finput" placeholder="🔍 Filtra per ragione sociale, numero fattura o importo..." style="width: 100%;"></div>' +
        '<div id="rec-candidates-list"></div>' +
        '<div id="rec-total-selected" style="margin-top:0.5rem; padding:0.3rem 0.5rem; background:#f0f9ff; border-radius:6px; font-size:0.8rem;"><strong>Totale selezionato:</strong> € 0,00</div>';
    }
  }

  var cassaHtml = '';
  var isEntrataBancaria = (parseFloat(m.entrata) || 0) > 0;
  var movimentiCassa = movimentiCassaRiconciliabili(isEntrataBancaria);
  if (movimentiCassa.length > 0) {
    var prelieviDiretti = movimentiCassa.filter(function(cm) { return cm.importo < 0; });
    var versamentiDaCassa = movimentiCassa.filter(function(cm) { return cm.importo > 0; });
    
    if (prelieviDiretti.length) {
      cassaHtml += '<div class="rec-section-lbl" style="margin-top:.75rem">💰 Prelievi dalla cassa già usciti (da abbinare direttamente)</div>';
      prelieviDiretti.forEach(function(cm) {
        var importoAssoluto = Math.abs(cm.importo);
        var keyCassa = 'cassa_' + cm.id;
        var saved = _recSelections[keyCassa] || { imp: 0, mod: 'contanti', isUscitaDiretta: true };
        var maxImp = Math.min(importoAssoluto, residuoMov);
        var suggImp = saved.imp > 0 ? saved.imp : maxImp;
        cassaHtml += '<div class="rec-inv-row" id="row-' + keyCassa + '">' +
          '<input type="checkbox" id="chk-' + keyCassa + '" onchange="toggleCassaSelection(\'' + keyCassa + '\', ' + maxImp + ', true)" ' + (saved.imp > 0 ? 'checked' : '') + '>' +
          '<div><strong>Prelievo contanti</strong><div style="font-size:0.7rem;">' + (cm.data ? cm.data.split('-').reverse().join('/') : '—') + ' · ' + esc(cm.descrizione) + ' · Importo: € ' + fmt(importoAssoluto) + '</div></div>' +
          '<input type="number" class="finput ri-inp" id="imp-' + keyCassa + '" value="' + suggImp.toFixed(2) + '" step="0.01" min="0" max="' + maxImp + '" oninput="updateCassaImp(\'' + keyCassa + '\', ' + maxImp + ', true)">' +
          '<select class="fselect ri-mod" id="mod-' + keyCassa + '" onchange="updateCassaMod(\'' + keyCassa + '\')"><option value="contanti">Contanti</option></select>' +
          '<span style="font-size:.75rem;color:#78716c;">/ € ' + fmt(maxImp) + '</span></div>';
      });
    }
    
    if (versamentiDaCassa.length) {
      cassaHtml += '<div class="rec-section-lbl" style="margin-top:.75rem">🏦 Versa in banca una disponibilità di cassa (entrata)</div>';
      cassaHtml += '<div style="font-size:0.75rem; color:#78716c; margin-bottom:0.5rem;">Seleziona un movimento di cassa positivo (es. incasso contanti). Verrà creata automaticamente l’uscita di cassa e riconciliata con il movimento bancario.</div>';
      versamentiDaCassa.forEach(function(cm) {
        var importoDisponibile = Math.abs(cm.importo);
        var keyCassa = 'versa_' + cm.id;
        var saved = _recSelections[keyCassa] || { imp: 0, mod: 'contanti', isVersamento: true };
        var maxImp = Math.min(importoDisponibile, residuoMov);
        var suggImp = saved.imp > 0 ? saved.imp : maxImp;
        cassaHtml += '<div class="rec-inv-row" id="row-' + keyCassa + '">' +
          '<input type="checkbox" id="chk-' + keyCassa + '" onchange="toggleVersamentoCassa(\'' + keyCassa + '\', ' + maxImp + ')" ' + (saved.imp > 0 ? 'checked' : '') + '>' +
          '<div><strong>💰 Entrata in cassa</strong><div style="font-size:0.7rem;">' + (cm.data ? cm.data.split('-').reverse().join('/') : '—') + ' · ' + esc(cm.descrizione) + ' · Disponibile: € ' + fmt(importoDisponibile) + '</div></div>' +
          '<input type="number" class="finput ri-inp" id="imp-' + keyCassa + '" value="' + suggImp.toFixed(2) + '" step="0.01" min="0" max="' + maxImp + '" oninput="updateVersamentoImp(\'' + keyCassa + '\', ' + maxImp + ')">' +
          '<select class="fselect ri-mod" id="mod-' + keyCassa + '" onchange="updateVersamentoMod(\'' + keyCassa + '\')"><option value="contanti">Contanti</option></select>' +
          '<span style="font-size:.75rem;color:#78716c;">/ € ' + fmt(maxImp) + '</span></div>';
      });
    }
  }

  var fcHtml = '<div class="rec-section-lbl" style="margin-top:.75rem">Chiusura forzata (senza documento — commissioni, F24, stipendi, ecc.)</div>' +
    '<div class="force-close-form">' +
    '<select class="fselect" id="fc-cat"><option value="">— Categoria —</option>' + Object.entries(EXTRA_CAT).map(function(entry) { return '<option value="' + entry[0] + '">' + entry[1] + '</option>'; }).join('') + '</select>' +
    '<input type="text" class="finput" id="fc-nota" placeholder="Nota descrittiva (es. commissioni maggio)">' +
    '<div style="display:flex;gap:.5rem"><input type="number" class="finput" id="fc-imp" step="0.01" min="0" placeholder="Importo €" value=""><select class="fselect" id="fc-mod"><option value="">— Metodo —</option>' + Object.entries(getMOD()).filter(function(entry) { return entry[0]; }).map(function(entry) { return '<option value="' + entry[0] + '">' + entry[1] + '</option>'; }).join('') + '</select></div>' +
    '<div id="fc-cassa-flag" style="display:none; margin-top: 0.5rem;"><label><input type="checkbox" id="fc-aggiorna-cassa"> 💰 Aggiorna anche la cassa contanti</label><p style="font-size:0.7rem; color:#78716c;">Se attivo, l\'importo verrà aggiunto/rimosso dalla cassa contanti (entrata per prelievo, uscita per versamento).</p></div>' +
    '</div>';

  var recBody = document.getElementById('rec-body');
  if (recBody) recBody.innerHTML = existingHtml + candidatesHtml + cassaHtml + fcHtml;

  function normalizeText(str) {
    if (!str) return '';
    var extraMatch = str.match(/(?:o\/c:|a favore di)\s*([^,;]+)/i);
    if (extraMatch) str = str + ' ' + extraMatch[1];
    return str.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function extractNumbers(str) {
    var matches = str.match(/\d+(?:\/\d+)?/g);
    return matches ? matches.map(function(m) { return m.replace('/', ''); }) : [];
  }

  if (Object.keys(_recSelections).length === 0 && residuoMov > 0 && candidates.length) {
    var descRaw = m.descrizione || '';
    var descNorm = normalizeText(descRaw);
    var descNumbers = extractNumbers(descRaw);
    var invoiceNumberPattern = /(?:fattura|fatt\.?|ft\.?|n\.?|nr\.?)\s*(?:n\.?\s*)?(\d+(?:[/-]\d+)?)/i;
    var matchNum = descRaw.match(invoiceNumberPattern);
    var extractedInvoiceNum = matchNum ? matchNum[1] : null;

    // Tolleranza sull'importo: max(3€, 8% dell'importo) più in alto che nell'esatto centesimo,
    // per coprire casi tipo fatture hotel dove l'importo bancario è leggermente inferiore al
    // totale fattura perché la tassa di soggiorno è stata pagata a parte in contanti.
    function amountToleranceFor(base) { return round2(Math.max(3, base * 0.08)); }

    var raw = candidates.map(function(c) {
      var doc = c.doc;
      var docRsNorm = normalizeText(doc.rs);
      var docNum = String(doc.num || '').toLowerCase();
      var docTot = nettoDaPagare(doc); // v2.23: in banca arriva il netto, non il totale documento
      var docResiduo = c.residuo;

      // --- segnale ragione sociale ---
      // Tre metodi indipendenti: sottostringa esatta, copertura delle parole significative
      // (escludendo forme societarie generiche come "srl"), somiglianza fuzzy su una finestra
      // scorrevole della descrizione (utile quando il nome è scritto per intero ma la
      // descrizione bancaria è molto più lunga).
      var exactSub = docRsNorm.length > 5 && descNorm.includes(docRsNorm);
      var nameWords = meaningfulWords(docRsNorm);
      var coverage = 0;
      if (nameWords.length) {
        var matchCount = 0;
        for (var w = 0; w < nameWords.length; w++) if (descNorm.includes(nameWords[w])) matchCount++;
        coverage = matchCount / nameWords.length;
      }
      var fuzzy = docRsNorm.length > 5 ? fuzzyContains(descNorm, docRsNorm) : 0;
      var nameScore = exactSub ? 1 : Math.max(coverage, fuzzy);
      var strongName = exactSub || coverage >= 0.7 || fuzzy >= 0.8;

      // --- segnale numero fattura ---
      // Un numero corto (es. "1", "23") è troppo generico per essere un segnale forte da solo:
      // serve almeno 3 cifre significative per considerarlo affidabile in autonomia.
      var digitsOnly = docNum.replace(/\D/g, '');
      var numMatch = false, strongNum = false;
      if (docNum.length > 1 && (descNorm.includes(docNum) || (extractedInvoiceNum && docNum.includes(extractedInvoiceNum.toLowerCase())))) {
        numMatch = true;
        strongNum = digitsOnly.length >= 3;
      } else if (descNumbers.some(function(n) { return n.length >= 3 && docNum.includes(n); })) {
        numMatch = true;
        strongNum = true;
      }

      // --- segnale importo ---
      // Spesso il segnale più affidabile (es. fatture hotel, dove la ragione sociale in banca
      // non coincide quasi mai con l'emittente): importo esatto o "vicino" entro tolleranza.
      var diffTot = Math.abs(docTot - movAmt);
      var diffRes = Math.abs(docResiduo - residuoMov);
      var minDiff = Math.min(diffTot, diffRes);
      var tol = amountToleranceFor(Math.max(docTot, movAmt, 1));
      var amountExact = minDiff < 0.01;
      var amountClose = !amountExact && minDiff <= tol;

      // --- segnale data ---
      // Fornitori come gli hotel fatturano quasi sempre a ridosso del pagamento: una data
      // fattura vicina alla data del movimento rafforza il match. Serve anche a scegliere,
      // tra più fatture aperte dello stesso fornitore ricorrente, quella del periodo giusto
      // invece della prima disponibile.
      var diffDays = daysBetween(doc.data, m.data);
      var dateScore = Math.max(0, 1 - diffDays / 45);
      var strongDate = diffDays <= 10;

      var modNames = Object.values(getMOD()).map(function(v) { return v.toLowerCase(); });
      var modHint = modNames.some(function(mod) { return mod && descNorm.includes(mod); });

      var score = Math.round(nameScore * 500) + (numMatch ? 200 : 0) + (amountExact ? 150 : amountClose ? 70 : 0) + Math.round(dateScore * 60) + (modHint ? 15 : 0);

      return { candidate: c, score: score, nameScore: nameScore, strongName: strongName, strongNum: strongNum, amountExact: amountExact, amountClose: amountClose, diffDays: diffDays, strongDate: strongDate, rsKey: docRsNorm, importoDocResiduo: c.residuo };
    });

    // Un importo esatto (o vicino, entro tolleranza) che risulta l'UNICO tra i documenti aperti
    // compatibile con questo movimento è di per sé un segnale forte, anche senza nome o numero:
    // è il caso tipico delle fatture hotel, dove la ragione sociale in banca non aiuta.
    var countExact = raw.filter(function(s) { return s.amountExact; }).length;
    var countCloseOrExact = raw.filter(function(s) { return s.amountExact || s.amountClose; }).length;
    // Per ogni ragione sociale, la fattura con data più vicina al movimento — usata per
    // arbitrare tra più fatture aperte dello stesso fornitore ricorrente.
    var minDateByRs = {};
    raw.forEach(function(s) {
      if (!s.rsKey) return;
      if (!(s.rsKey in minDateByRs) || s.diffDays < minDateByRs[s.rsKey]) minDateByRs[s.rsKey] = s.diffDays;
    });
    var scored = raw.map(function(s) {
      var uniqueAmountExact = s.amountExact && countExact === 1;
      var uniqueAmountClose = (s.amountExact || s.amountClose) && countCloseOrExact === 1;
      var amountDateCombo = (s.amountExact || s.amountClose) && s.strongDate;
      var nameNumCombo = (s.strongName && (s.strongNum || s.amountExact || s.amountClose)) || (s.strongNum && (s.amountExact || s.amountClose));
      var isClosestDateForSupplier = !s.rsKey || minDateByRs[s.rsKey] === s.diffDays;
      var confidence = 'bassa';
      if (nameNumCombo || uniqueAmountExact || uniqueAmountClose || amountDateCombo) {
        confidence = 'alta';
        // Fornitore ricorrente con più fatture aperte: se il match si basa sul nome (non su un
        // numero fattura specifico, che è un identificativo univoco) e questa non è la fattura
        // con la data più vicina al movimento tra quelle dello stesso fornitore, non auto-selezionare
        // — probabilmente è il periodo sbagliato.
        if (nameNumCombo && !s.strongNum && !isClosestDateForSupplier) confidence = 'media';
      } else if (s.strongName || s.strongNum || s.amountExact || s.amountClose || s.nameScore > 0.3) {
        confidence = 'media';
      }
      return Object.assign({}, s, { confidence: confidence });
    });
    scored.sort(function(a, b) { return b.score - a.score; });
    scored.forEach(function(s) {
      var key = s.candidate.type + '_' + s.candidate.doc.id;
      _recCandidateScores[key] = { score: s.score, confidence: s.confidence };
    });

    // Solo i candidati a confidenza ALTA vengono pre-spuntati automaticamente. Quelli a
    // confidenza MEDIA restano in cima alla lista (vedi sortCandidatesByPreselected) con
    // un'etichetta "probabile match", ma l'utente deve confermarli lui stesso con un clic.
    var remaining = residuoMov;
    for (var si = 0; si < scored.length; si++) {
      var s = scored[si];
      if (s.confidence !== 'alta') continue;
      var importoDaUsare = Math.min(s.importoDocResiduo, remaining);
      if (importoDaUsare > 0.01) {
        var key = s.candidate.type + '_' + s.candidate.doc.id;
        _recSelections[key] = { imp: importoDaUsare, mod: s.candidate.doc.modpag || 'bonifico' };
        remaining -= importoDaUsare;
        if (remaining < 0.01) break;
      }
    }
  }

  function sortCandidatesByPreselected(cands) {
    var preselectedKeys = new Set(Object.keys(_recSelections));
    var preselected = [], others = [];
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (preselectedKeys.has(c.type + '_' + c.doc.id)) preselected.push(c);
      else others.push(c);
    }
    // Tra i non preselezionati, i "probabili match" (confidenza media) vengono comunque
    // mostrati in cima, così l'utente li vede subito anche se deve confermarli lui stesso.
    others.sort(function(a, b) {
      var sa = _recCandidateScores[a.type + '_' + a.doc.id] || { score: 0 };
      var sb = _recCandidateScores[b.type + '_' + b.doc.id] || { score: 0 };
      return sb.score - sa.score;
    });
    return preselected.concat(others);
  }

  if (candidates.length && residuoMov > 0) {
    window._recCandidates = candidates;
    window._renderCandidatesList = function(filterText) {
      if (filterText === undefined) filterText = '';
      var container = document.getElementById('rec-candidates-list');
      if (!container) return;
      var lowerFilter = filterText.toLowerCase();
      var filtered = window._recCandidates.filter(function(c) {
        return lowerFilter === '' ||
          c.doc.rs.toLowerCase().includes(lowerFilter) ||
          String(c.doc.num || '').toLowerCase().includes(lowerFilter) ||
          (c.doc.tot && c.doc.tot.toString().includes(lowerFilter));
      });
      filtered = sortCandidatesByPreselected(filtered);
      container.innerHTML = filtered.map(function(c) {
        var key = c.type + '_' + c.doc.id;
        var saved = _recSelections[key] || { imp: 0, mod: '' };
        var maxImp = Math.min(c.residuo, residuoMov);
        var suggestedImp = saved.imp > 0 ? saved.imp : maxImp;
        var conf = _recCandidateScores[key] ? _recCandidateScores[key].confidence : null;
        var suggBadge = (conf === 'media' && saved.imp === 0) ? ' <span class="badge" style="background:#fef3c7;color:#92400e">🎯 probabile match</span>' : '';
        return '<div class="rec-inv-row" id="row-' + key + '">' +
          '<input type="checkbox" id="chk-' + key + '" onchange="toggleDocSelection(\'' + key + '\', ' + maxImp + ')" ' + (saved.imp > 0 ? 'checked' : '') + '>' +
          '<div><strong>' + esc(c.doc.rs) + '</strong> ' + (c.isCredito ? '<span class="badge badge-nc">NOTA CREDITO</span>' : '<span class="badge badge-f">FATTURA</span>') + suggBadge +
          '<div style="font-size:0.7rem;">' + esc(c.doc.num) + ' · ' + (c.doc.data ? c.doc.data.split('-').reverse().join('/') : '—') + ' · ' + (c.isCredito ? 'Credito residuo' : 'Residuo') + ': € ' + fmt(c.residuo) + '</div></div>' +
          '<input type="number" class="finput ri-inp" id="imp-' + key + '" value="' + suggestedImp.toFixed(2) + '" step="0.01" min="0" max="' + maxImp + '" oninput="updateDocImp(\'' + key + '\', ' + maxImp + ')">' +
          '<select class="fselect ri-mod" id="mod-' + key + '" onchange="updateDocMod(\'' + key + '\')">' + modOptions(saved.mod) + '</select>' +
          '<span style="font-size:.75rem;color:#78716c;">/ € ' + fmt(maxImp) + '</span></div>';
      }).join('');
      for (var key in _recSelections) {
        if (key.startsWith('cassa_') || key.startsWith('versa_')) continue;
        var chk = document.getElementById('chk-' + key);
        var impField = document.getElementById('imp-' + key);
        var modSelect = document.getElementById('mod-' + key);
        if (chk && impField && modSelect) {
          chk.checked = true;
          impField.value = _recSelections[key].imp.toFixed(2);
          modSelect.value = _recSelections[key].mod;
        }
      }
      updateTotal();
    };
    setTimeout(function() {
      var filterInput = document.getElementById('rec-filter-input');
      if (filterInput) {
        filterInput.addEventListener('input', function(e) { window._renderCandidatesList(e.target.value); });
        window._renderCandidatesList('');
      }
    }, 50);
  }

  var fcModSelect = document.getElementById('fc-mod');
  var toggleCassaFlag = function() {
    var flagDiv = document.getElementById('fc-cassa-flag');
    if (flagDiv) flagDiv.style.display = fcModSelect.value === 'contanti' ? 'block' : 'none';
  };
  if (fcModSelect) {
    fcModSelect.removeEventListener('change', toggleCassaFlag);
    fcModSelect.addEventListener('change', toggleCassaFlag);
    toggleCassaFlag();
  }

  var updateTotal = function() {
    var total = 0;
    for (var key in _recSelections) total += _recSelections[key].imp;
    var totalEl = document.getElementById('rec-total-selected');
    if (totalEl) totalEl.innerHTML = '<strong>Totale selezionato:</strong> € ' + fmt(total) + ' (max movimento: € ' + fmt(residuoMov) + ')';
  };
  window.updateTotal = updateTotal;
  updateTotal();
}

window.toggleDocSelection = function(key, maxImp) {
  var cb = document.getElementById('chk-' + key);
  var impField = document.getElementById('imp-' + key);
  var modField = document.getElementById('mod-' + key);
  if (cb.checked) {
    var imp = parseFloat(impField.value) || 0;
    if (imp > maxImp) imp = maxImp;
    impField.value = imp.toFixed(2);
    _recSelections[key] = { imp: imp, mod: modField.value };
  } else {
    delete _recSelections[key];
    impField.value = '0';
  }
  if (window.updateTotal) window.updateTotal();
};
window.updateDocImp = function(key, maxImp) {
  var impField = document.getElementById('imp-' + key);
  var imp = parseFloat(impField.value) || 0;
  if (imp > maxImp) imp = maxImp;
  impField.value = imp.toFixed(2);
  var cb = document.getElementById('chk-' + key);
  if (imp > 0.01) {
    cb.checked = true;
    var mod = document.getElementById('mod-' + key).value;
    _recSelections[key] = { imp: imp, mod: mod };
  } else {
    cb.checked = false;
    delete _recSelections[key];
  }
  if (window.updateTotal) window.updateTotal();
};
window.updateDocMod = function(key) {
  if (_recSelections[key]) _recSelections[key].mod = document.getElementById('mod-' + key).value;
};
window.toggleCassaSelection = function(key, maxImp, isUscitaDiretta = true) {
  var cb = document.getElementById('chk-' + key);
  var impField = document.getElementById('imp-' + key);
  var modField = document.getElementById('mod-' + key);
  if (cb.checked) {
    var imp = parseFloat(impField.value) || 0;
    if (imp > maxImp) imp = maxImp;
    impField.value = imp.toFixed(2);
    _recSelections[key] = { imp: imp, mod: modField.value, isCassa: true, isUscitaDiretta: isUscitaDiretta };
  } else {
    delete _recSelections[key];
    impField.value = '0';
  }
  if (window.updateTotal) window.updateTotal();
};
window.updateCassaImp = function(key, maxImp, isUscitaDiretta = true) {
  var impField = document.getElementById('imp-' + key);
  var imp = parseFloat(impField.value) || 0;
  if (imp > maxImp) imp = maxImp;
  impField.value = imp.toFixed(2);
  var cb = document.getElementById('chk-' + key);
  if (imp > 0.01) {
    cb.checked = true;
    var mod = document.getElementById('mod-' + key).value;
    _recSelections[key] = { imp: imp, mod: mod, isCassa: true, isUscitaDiretta: isUscitaDiretta };
  } else {
    cb.checked = false;
    delete _recSelections[key];
  }
  if (window.updateTotal) window.updateTotal();
};
window.updateCassaMod = function(key) {
  if (_recSelections[key] && _recSelections[key].isCassa) _recSelections[key].mod = document.getElementById('mod-' + key).value;
};
window.toggleVersamentoCassa = function(key, maxImp) {
  var cb = document.getElementById('chk-' + key);
  var impField = document.getElementById('imp-' + key);
  var modField = document.getElementById('mod-' + key);
  if (cb.checked) {
    var imp = parseFloat(impField.value) || 0;
    if (imp > maxImp) imp = maxImp;
    impField.value = imp.toFixed(2);
    _recSelections[key] = { imp: imp, mod: modField.value, isVersamento: true, cassaId: key.split('_')[1] };
  } else {
    delete _recSelections[key];
    impField.value = '0';
  }
  if (window.updateTotal) window.updateTotal();
};
window.updateVersamentoImp = function(key, maxImp) {
  var impField = document.getElementById('imp-' + key);
  var imp = parseFloat(impField.value) || 0;
  if (imp > maxImp) imp = maxImp;
  impField.value = imp.toFixed(2);
  var cb = document.getElementById('chk-' + key);
  if (imp > 0.01) {
    cb.checked = true;
    var mod = document.getElementById('mod-' + key).value;
    _recSelections[key] = { imp: imp, mod: mod, isVersamento: true, cassaId: key.split('_')[1] };
  } else {
    cb.checked = false;
    delete _recSelections[key];
  }
  if (window.updateTotal) window.updateTotal();
};
window.updateVersamentoMod = function(key) {
  if (_recSelections[key]) _recSelections[key].mod = document.getElementById('mod-' + key).value;
};
window.deleteCassaLink = function(movId, idx) {
  var m = S.movimenti.find(function(x) { return x.id === movId; });
  if (!m) return;
  var c = m.riconciliazioniCassa[idx];
  if (!c) return;
  annullaCollegamentoCassa(c);
  m.riconciliazioniCassa.splice(idx, 1);
  m.riconciliato = movRicTotale(m);
  save();
  renderRecModal(m);
  renderMov();
  refreshCassa();
  toast('🗑️ Abbinamento con cassa rimosso', 'info');
};
window.confirmRec = function() {
  var m = S.movimenti.find(function(x) { return x.id === _recMovId; });
  if (!m) return;
  var isOutflow = m.uscita > 0;
  var residuoMov = movResiduo(m);
  var totalSelected = Object.values(_recSelections).reduce(function(s, v) { return s + v.imp; }, 0);
  var fcImp = parseFloat((document.getElementById('fc-imp') ? document.getElementById('fc-imp').value : 0)) || 0;
  var fcNota = (document.getElementById('fc-nota') ? document.getElementById('fc-nota').value : '').trim();
  var fcCat = (document.getElementById('fc-cat') ? document.getElementById('fc-cat').value : 'altro');
  var fcMod = (document.getElementById('fc-mod') ? document.getElementById('fc-mod').value : '');
  var aggiornaCassaFlag = (document.getElementById('fc-aggiorna-cassa') ? document.getElementById('fc-aggiorna-cassa').checked : false);
  
  // Arrotondamento finale: se la somma selezionata è vicinissima al residuo per un errore di
  // virgola mobile (max mezzo centesimo), distribuisci la differenza sull'ultima riga selezionata
  // invece di lasciare un residuo fantasma da 0,00x€.
  // v2.22: diff calcolato SENZA round2 — arrotondato ai centesimi non poteva mai essere tra 0 e 0,005,
  // quindi questa correzione non scattava mai.
  var diff = residuoMov - (totalSelected + fcImp);
  if (Math.abs(diff) > 1e-9 && Math.abs(diff) < 0.005) {
    var keys = Object.keys(_recSelections);
    if (keys.length) {
      var lastKey = keys[keys.length - 1];
      _recSelections[lastKey].imp = _recSelections[lastKey].imp + diff;
      totalSelected = totalSelected + diff;
    }
  }
  
  if (totalSelected + fcImp > residuoMov + 0.01) {
    toast('⚠️ Totale selezionato + chiusura (€ ' + fmt(totalSelected+fcImp) + ') supera il residuo del movimento (€ ' + fmt(residuoMov) + ')', 'warn');
    return;
  }
  if (totalSelected === 0 && fcImp === 0) {
    toast('⚠️ Seleziona almeno un documento o inserisci una chiusura forzata', 'warn');
    return;
  }
  
  var docsAbbinati = Object.keys(_recSelections).filter(function(k) { return !k.startsWith('cassa_') && !k.startsWith('versa_'); }).length;
  var cassaAbbinati = Object.keys(_recSelections).filter(function(k) { return k.startsWith('cassa_'); }).length;
  var versamentiAbbinati = Object.keys(_recSelections).filter(function(k) { return k.startsWith('versa_'); }).length;
  
  for (var entry of Object.entries(_recSelections)) {
    var key = entry[0], sel = entry[1];
    if (sel.isCassa || sel.isVersamento) continue;
    var parts = key.split('_');
    if (parts.length !== 2) continue;
    var docType = parts[0], docId = parts[1];
    var doc = S[docType].find(function(d) { return d.id === docId; });
    if (!doc) continue;
    var importo = sel.imp;
    if (importo <= 0) continue;
    doc.pagamenti = doc.pagamenti || [];
    doc.pagamenti.push({
      data: m.data,
      importo: importo,
      mod: sel.mod,
      _movId: m.id,
      _movDesc: m.descrizione.slice(0, 60)
    });
    doc.pagato = round2((doc.pagato || 0) + importo);
    m.riconciliazioni = m.riconciliazioni || [];
    m.riconciliazioni.push({ t: docType, id: doc.id, imp: importo, mod: sel.mod });
    if (!doc.modpag && sel.mod) doc.modpag = sel.mod;
  }
  
  for (var entry of Object.entries(_recSelections)) {
    var key = entry[0], sel = entry[1];
    if (!sel.isCassa) continue;
    var parts = key.split('_');
    if (parts[0] !== 'cassa') continue;
    var cassaMovId = parts[1];
    var cassaMov = (S.cassa.movimenti || []).find(function(cm) { return cm.id === cassaMovId; });
    if (!cassaMov) continue;
    var importo = sel.imp;
    if (importo <= 0) continue;
    cassaMov.riconciliatoConMovId = m.id;
    cassaMov.riconciliatoImp = (cassaMov.riconciliatoImp || 0) + importo;
    m.riconciliazioniCassa = m.riconciliazioniCassa || [];
    m.riconciliazioniCassa.push({ id: cassaMov.id, imp: importo, descrizione: cassaMov.descrizione });
  }
  
  for (var entry of Object.entries(_recSelections)) {
    var key = entry[0], sel = entry[1];
    if (!sel.isVersamento) continue;
    var cassaMovId = sel.cassaId;
    var cassaEntrata = (S.cassa.movimenti || []).find(function(cm) { return cm.id === cassaMovId; });
    if (!cassaEntrata) continue;
    var importoVersato = sel.imp;
    if (importoVersato <= 0) continue;
    var idUscita = creaUscitaCassaDaVersamento(cassaEntrata, importoVersato, m.data, m.id);
    var nuovaUscita = S.cassa.movimenti.find(function(cm) { return cm.id === idUscita; });
    if (nuovaUscita) {
      nuovaUscita.riconciliatoConMovId = m.id;
      nuovaUscita.riconciliatoImp = importoVersato;
      m.riconciliazioniCassa = m.riconciliazioniCassa || [];
      m.riconciliazioniCassa.push({ id: nuovaUscita.id, imp: importoVersato, descrizione: nuovaUscita.descrizione });
    }
    cassaEntrata.usatoPerVersamento = true;
    save();
  }
  
  var idCassa = null;
  if (fcImp > 0) {
    m.chiusureExtra = m.chiusureExtra || [];
    m.chiusureExtra.push({
      id: uid(),
      data: m.data,
      imp: round2(fcImp),
      nota: fcNota,
      categoria: fcCat,
      mod: fcMod,
      aggiornaCassa: (fcMod === 'contanti' && aggiornaCassaFlag)
    });
    var chiusura = m.chiusureExtra[m.chiusureExtra.length - 1];
    if (chiusura.aggiornaCassa) {
      var tipoCassa = isOutflow ? 'entrata' : 'uscita';
      var descrizioneCassa = (tipoCassa === 'entrata' ? 'Prelievo' : 'Versamento') + ' contanti: ' + (fcNota || m.descrizione);
      idCassa = aggiornaCassa(fcImp, tipoCassa, descrizioneCassa, m.id, m.data);
      chiusura.idCassa = idCassa;
    }
  }
  m.riconciliato = movRicTotale(m);
  _recMovId = null;
  _recSelections = {};
  save(); render('a'); render('p'); renderMov(); refreshCassa();
  closeModal('m-rec');
  var msgParts = [];
  if (docsAbbinati > 0) msgParts.push(docsAbbinati + ' documento/i abbinati');
  if (cassaAbbinati > 0) msgParts.push(cassaAbbinati + ' prelievo/i di cassa abbinati');
  if (versamentiAbbinati > 0) msgParts.push(versamentiAbbinati + ' versamento/i da cassa a banca effettuati');
  if (fcImp > 0) msgParts.push('chiusura forzata € ' + fmt(fcImp) + (aggiornaCassaFlag ? ' (con cassa)' : ''));
  toast('✅ ' + msgParts.join(' + '), 'success');
};
window.deleteRecLink = function(movId, type, invId, idx) {
  var m = S.movimenti.find(function(x) { return x.id === movId; });
  if (!m) return;
  var r = m.riconciliazioni[idx];
  if (!r) return;
  var inv = (S[type] || []).find(function(i) { return i.id === invId; });
  if (inv) {
    // v2.22: rimuove UN solo pagamento (prima il filter li toglieva tutti se avevano lo stesso importo,
    // ma sottraeva l'importo una volta sola)
    var pagIdx = (inv.pagamenti || []).findIndex(function(p) { return p._movId === movId && Math.abs(p.importo - r.imp) < 0.01; });
    if (pagIdx !== -1) inv.pagamenti.splice(pagIdx, 1);
    inv.pagato = round2(Math.max(0, (inv.pagato || 0) - r.imp));
  }
  m.riconciliazioni.splice(idx, 1);
  m.riconciliato = movRicTotale(m);
  save(); render('a'); render('p');
  renderRecModal(m);
  renderMov();
  toast('🗑️ Abbinamento rimosso', 'info');
};
window.deleteChiusuraExtra = function(movId, idx) {
  var m = S.movimenti.find(function(x) { return x.id === movId; });
  if (!m) return;
  var ch = m.chiusureExtra[idx];
  if (ch && ch.aggiornaCassa && ch.idCassa) {
    S.cassa.movimenti = S.cassa.movimenti.filter(function(c) { return c.id !== ch.idCassa; });
    S.cassa.saldo = round2(S.cassa.movimenti.reduce(function(s, c) { return s + c.importo; }, 0));
  }
  m.chiusureExtra.splice(idx, 1);
  m.riconciliato = movRicTotale(m);
  save();
  renderRecModal(m);
  renderMov();
  refreshCassa();
  toast('🗑️ Chiusura forzata rimossa', 'info');
};

// ======================== COMPENSAZIONE CON NOTA DI CREDITO ========================
function openCreditNoteCompensation(invId, type) {
  var inv = S[type].find(function(i) { return i.id === invId; });
  if (!inv) return;
  var normalize = function(s) { return s.toLowerCase().replace(/[^a-z0-9]/g, ''); };
  var normInvRs = normalize(inv.rs);
  var creditNotes = S[type].filter(function(doc) {
    return doc.tipo === 'nota_credito' && normalize(doc.rs) === normInvRs && residuo(doc) > 0;
  });
  if (creditNotes.length === 0) {
    toast('Nessuna nota di credito disponibile per questo soggetto', 'warn');
    return;
  }
  var html = '<div class="rec-section-lbl">Seleziona una nota di credito da compensare</div>';
  creditNotes.forEach(function(nota) {
    var residuoNota = residuo(nota);
    var maxComp = Math.min(residuo(inv), residuoNota);
    html += '<div class="rec-inv-row" style="margin-bottom: 8px;">' +
      '<div><strong>' + esc(nota.num) + '</strong> del ' + (nota.data ? nota.data.split('-').reverse().join('/') : '—') + '<br>Credito residuo: € ' + fmt(residuoNota) + '</div>' +
      '<div><label>Importo da compensare: € <input type="number" id="comp_amt_' + nota.id + '" value="' + maxComp.toFixed(2) + '" step="0.01" min="0" max="' + maxComp + '" style="width: 100px;"></label></div>' +
      '<div><button class="btn btn-blue btn-sm" onclick="applyCreditNoteCompensation(\'' + inv.id + '\',\'' + type + '\',\'' + nota.id + '\')">Compensa</button></div>' +
      '</div>';
  });
  var modalBody = document.getElementById('credit-note-body');
  if (modalBody) modalBody.innerHTML = html;
  openModal('m-credit-note');
}
function applyCreditNoteCompensation(invId, invType, notaId) {
  var inv = S[invType].find(function(i) { return i.id === invId; });
  var nota = S[invType].find(function(i) { return i.id === notaId; });
  if (!inv || !nota) return;
  var impInput = document.getElementById('comp_amt_' + notaId);
  var importo = parseFloat(impInput.value);
  if (isNaN(importo) || importo <= 0) { toast('Importo non valido', 'error'); return; }
  var residuoInv = residuo(inv);
  var residuoNota = residuo(nota);
  if (importo > residuoInv) { toast('Importo supera il residuo della fattura (€ ' + fmt(residuoInv) + ')', 'warn'); return; }
  if (importo > residuoNota) { toast('Importo supera il credito residuo della nota (€ ' + fmt(residuoNota) + ')', 'warn'); return; }
  inv.pagamenti = inv.pagamenti || [];
  inv.pagamenti.push({
    data: today(),
    importo: importo,
    mod: 'nota_credito',
    _notaId: nota.id,
    _notaNum: nota.num
  });
  inv.pagato = round2((inv.pagato || 0) + importo);
  nota.pagato = round2((nota.pagato || 0) + importo);
  save();
  render(invType);
  closeModal('m-credit-note');
  toast('✅ Compensazione di € ' + fmt(importo) + ' applicata dalla nota ' + nota.num, 'success');
}

// ======================== RICONCILIAZIONE BIDIREZIONALE (con filtro) ========================
function openLinkToMovement(invId, type) {
  _linkInvId = invId;
  _linkInvType = type;
  renderLinkMovementModal();
  openModal('m-link-payment');
}
function confirmLinkPayment() { confirmLinkToMovement(); }

let _linkMovementsCache = [];

function renderLinkMovementModal() {
  var inv = S[_linkInvType].find(function(i) { return i.id === _linkInvId; });
  if (!inv) return;
  var residuoFattura = residuo(inv);
  _linkMovementsCache = S.movimenti.filter(function(m) { return movResiduo(m) > 0; });
  
  var container = document.getElementById('link-mov-modal-body');
  if (!container) return;
  
  var html = '<p>Fattura: <strong>' + esc(inv.rs) + '</strong> - Residuo: € ' + fmt(residuoFattura) + '</p>';
  html += '<div class="rec-section-lbl">Seleziona un movimento bancario</div>';
  html += '<input type="text" id="link-mov-filter" class="link-mov-filter" placeholder="🔍 Filtra per descrizione, importo o data (es. 2025-03 o 150,00)">';
  html += '<div id="link-mov-list" style="max-height: 300px; overflow-y: auto;"></div>';
  container.innerHTML = html;
  
  function filterAndRender() {
    var filterText = document.getElementById('link-mov-filter')?.value.toLowerCase() || '';
    var filtered = _linkMovementsCache.filter(function(m) {
      if (filterText === '') return true;
      var descMatch = m.descrizione.toLowerCase().includes(filterText);
      var importoMatch = (m.entrata > 0 ? m.entrata : m.uscita).toString().includes(filterText);
      var dataMatch = (m.data || '').includes(filterText);
      return descMatch || importoMatch || dataMatch;
    });
    
    var listContainer = document.getElementById('link-mov-list');
    if (!listContainer) return;
    if (filtered.length === 0) {
      listContainer.innerHTML = '<div style="padding: 1rem; text-align: center; color: #a8a29e;">Nessun movimento corrispondente</div>';
      return;
    }
    listContainer.innerHTML = filtered.map(function(m) {
      var residuoMov = movResiduo(m);
      var importoMax = Math.min(residuoFattura, residuoMov);
      return '<div class="rec-inv-row" style="margin-bottom: 8px;" data-mov-id="' + m.id + '">' +
        '<div><input type="radio" name="selectedMov" value="' + m.id + '" id="mov_' + m.id + '"></div>' +
        '<div><strong>' + (m.data ? m.data.split('-').reverse().join('/') : '—') + '</strong> - ' + esc(m.descrizione) + '<br><span style="font-size: 0.75rem;">Residuo movimento: € ' + fmt(residuoMov) + '</span></div>' +
        '<div><label>Importo da collegare: € <input type="number" id="imp_' + m.id + '" value="' + importoMax.toFixed(2) + '" step="0.01" min="0" max="' + importoMax + '" style="width: 100px;"></label></div>' +
        '<div><label>Metodo pagamento: <select id="mod_' + m.id + '">' + modOptions() + '</select></label></div>' +
        '</div>';
    }).join('');
  }
  
  filterAndRender();
  var filterInput = document.getElementById('link-mov-filter');
  if (filterInput) filterInput.addEventListener('input', filterAndRender);
}

function confirmLinkToMovement() {
  var selectedRadio = document.querySelector('#link-mov-list input[name="selectedMov"]:checked');
  if (!selectedRadio) { toast('Seleziona un movimento bancario', 'warn'); return; }
  var movId = selectedRadio.value;
  var impInput = document.getElementById('imp_' + movId);
  var modSelect = document.getElementById('mod_' + movId);
  var importo = parseFloat(impInput.value);
  var metodo = modSelect.value;
  if (isNaN(importo) || importo <= 0) { toast('Importo non valido', 'error'); return; }
  var movimento = S.movimenti.find(function(m) { return m.id === movId; });
  if (!movimento) return;
  var inv = S[_linkInvType].find(function(i) { return i.id === _linkInvId; });
  if (!inv) return;
  var residuoFattura = residuo(inv);
  var residuoMov = movResiduo(movimento);
  if (importo > residuoFattura) { toast('L\'importo supera il residuo della fattura (€ ' + fmt(residuoFattura) + ')', 'warn'); return; }
  if (importo > residuoMov) { toast('L\'importo supera il residuo del movimento (€ ' + fmt(residuoMov) + ')', 'warn'); return; }
  inv.pagamenti = inv.pagamenti || [];
  inv.pagamenti.push({
    data: movimento.data || today(),
    importo: importo,
    mod: metodo,
    _movId: movimento.id,
    _movDesc: movimento.descrizione.slice(0, 60)
  });
  inv.pagato = round2((inv.pagato || 0) + importo);
  movimento.riconciliazioni = movimento.riconciliazioni || [];
  movimento.riconciliazioni.push({
    t: _linkInvType,
    id: inv.id,
    imp: importo,
    mod: metodo
  });
  movimento.riconciliato = movRicTotale(movimento);
  if (!inv.modpag && metodo) inv.modpag = metodo;
  save();
  render(_linkInvType);
  renderMov();
  closeModal('m-link-payment');
  openPayments(_linkInvId, _linkInvType);
  toast('✅ Collegato movimento "' + movimento.descrizione + '" per € ' + fmt(importo), 'success');
}

// ======================== MODIFICA COMPLETA PAGAMENTO ========================

function openEditPayment(invId, type, idx) {
  _editPaymentInvId = invId;
  _editPaymentInvType = type;
  _editPaymentIdx = idx;
  var inv = S[type].find(function(i) { return i.id === invId; });
  if (!inv) return;
  var pag = inv.pagamenti[idx];
  if (!pag) return;
  document.getElementById('edit-pay-data').value = pag.data || '';
  document.getElementById('edit-pay-amount').value = pag.importo;
  var select = document.getElementById('edit-pay-mod');
  select.innerHTML = modOptions(pag.mod);
  openModal('m-edit-payment');
}

function confirmEditPayment() {
  var inv = S[_editPaymentInvType].find(function(i) { return i.id === _editPaymentInvId; });
  if (!inv) return;
  var pag = inv.pagamenti[_editPaymentIdx];
  if (!pag) return;
  var newData = document.getElementById('edit-pay-data').value;
  var newAmount = parseFloat(document.getElementById('edit-pay-amount').value);
  var newMod = document.getElementById('edit-pay-mod').value;
  if (!newData) { toast('Data non valida', 'error'); return; }
  if (isNaN(newAmount) || newAmount <= 0) { toast('Importo non valido', 'error'); return; }
  var oldAmount = pag.importo;
  var oldMod = pag.mod;
  var oldData = pag.data;
  var diff = round2(newAmount - oldAmount);
  var newResiduo = residuo(inv) - diff;
  if (newResiduo < -0.005) { toast('L\'importo supera il totale della fattura', 'warn'); return; }
  var movimento = pag._movId ? S.movimenti.find(function(m) { return m.id === pag._movId; }) : null;
  // v2.22: se il pagamento è collegato a un movimento, l'aumento non può superarne il residuo
  if (movimento && diff > 0 && diff > movResiduo(movimento) + 0.005) {
    toast('L\'aumento supera il residuo del movimento bancario collegato (€ ' + fmt(movResiduo(movimento)) + ')', 'warn');
    return;
  }
  pag.data = newData;
  pag.importo = newAmount;
  pag.mod = newMod;
  inv.pagato = round2((inv.pagato || 0) + diff);
  if (movimento) {
    var riconc = (movimento.riconciliazioni || []).find(function(r) { return r.id === inv.id && r.t === _editPaymentInvType && Math.abs(r.imp - oldAmount) < 0.01; }) ||
      (movimento.riconciliazioni || []).find(function(r) { return r.id === inv.id && r.t === _editPaymentInvType; });
    if (riconc) {
      riconc.imp = newAmount;
      riconc.mod = newMod;
    }
    movimento.riconciliato = movRicTotale(movimento);
  }
  // v2.22: la rettifica cassa guarda il metodo VECCHIO per stornare e il NUOVO per registrare.
  // Prima si controllava pag.mod dopo averlo già sovrascritto, quindi il cambio contanti → bonifico
  // non stornava la cassa e bonifico → contanti stornava un importo mai entrato.
  // I pagamenti collegati a un movimento bancario non toccano la cassa (come in confirmRec).
  if (!movimento) {
    if (oldMod === 'contanti') {
      var tipoRettificaOld = _editPaymentInvType === 'a' ? 'uscita' : 'entrata';
      var descOld = 'RETTIFICA modifica pagamento fattura ' + inv.num + ' - ' + inv.rs;
      aggiornaCassa(oldAmount, tipoRettificaOld, descOld, inv.id, oldData);
    }
    if (newMod === 'contanti') {
      var tipoRettificaNew = _editPaymentInvType === 'a' ? 'entrata' : 'uscita';
      var descNew = 'Pagamento modificato fattura ' + inv.num + ' - ' + inv.rs;
      aggiornaCassa(newAmount, tipoRettificaNew, descNew, inv.id, newData);
    }
  }
  save();
  render(_editPaymentInvType);
  renderMov();
  openPayments(_editPaymentInvId, _editPaymentInvType);
  closeModal('m-edit-payment');
  toast('✅ Pagamento aggiornato', 'success');
}

// ======================== MODIFICA METODO DI PAGAMENTO (solo metodo) ========================
function openEditPaymentMethod(invId, type, idx) {
  _editPaymentInvId = invId;
  _editPaymentInvType = type;
  _editPaymentIdx = idx;
  var inv = S[type].find(function(i) { return i.id === invId; });
  if (!inv) return;
  var pag = inv.pagamenti[idx];
  if (!pag) return;
  var select = document.getElementById('edit-pay-method-select');
  if (select) select.innerHTML = modOptions(pag.mod);
  openModal('m-edit-pay-method');
}
function confirmEditPaymentMethod() {
  var inv = S[_editPaymentInvType].find(function(i) { return i.id === _editPaymentInvId; });
  if (!inv) return;
  var pag = inv.pagamenti[_editPaymentIdx];
  if (!pag) return;
  var newMod = document.getElementById('edit-pay-method-select').value;
  if (!newMod) { toast('Seleziona un metodo di pagamento', 'warn'); return; }
  var oldMod = pag.mod;
  pag.mod = newMod;
  if (pag._movId) {
    var movimento = S.movimenti.find(function(m) { return m.id === pag._movId; });
    if (movimento) {
      var riconc = movimento.riconciliazioni.find(function(r) { return r.id === inv.id && r.t === _editPaymentInvType; });
      if (riconc) riconc.mod = newMod;
    }
  }
  if (inv.modpag === oldMod && inv.pagamenti.length === 1) inv.modpag = newMod;
  save();
  render(_editPaymentInvType);
  renderMov();
  openPayments(_editPaymentInvId, _editPaymentInvType);
  closeModal('m-edit-pay-method');
  toast('✅ Metodo di pagamento aggiornato', 'success');
}

// ======================== CHIUSURA FORZATA MULTIPLA ========================
function openMultiForcedClose() {
  var movimentiDaChiudere = S.movimenti.filter(function(m) { return movResiduo(m) > 0; });
  if (!movimentiDaChiudere.length) { toast('Nessun movimento da chiudere', 'info'); return; }
  var freq = {};
  movimentiDaChiudere.forEach(function(m) {
    var parole = m.descrizione.toLowerCase().split(/\W+/).filter(function(p) { return p.length > 3; });
    parole.forEach(function(p) { freq[p] = (freq[p] || 0) + 1; });
  });
  var suggerito = Object.keys(freq).sort(function(a,b) { return freq[b]-freq[a]; })[0] || '';
  var modalBody = '<div class="fg"><label class="flabel">Filtra movimenti (testo nella descrizione)</label>' +
    '<input type="text" id="multi-filter" class="finput" value="' + esc(suggerito) + '" placeholder="es. commissioni, F24, affitto..."></div>' +
    '<div class="fg"><label class="flabel">Categoria</label>' +
    '<select id="multi-cat" class="fselect">' + Object.entries(EXTRA_CAT).map(function(entry) { return '<option value="' + entry[0] + '">' + entry[1] + '</option>'; }).join('') + '</select></div>' +
    '<div class="fg"><label class="flabel">Metodo di pagamento</label>' +
    '<select id="multi-mod" class="fselect">' + Object.entries(getMOD()).filter(function(entry) { return entry[0]; }).map(function(entry) { return '<option value="' + entry[0] + '">' + entry[1] + '</option>'; }).join('') + '</select></div>' +
    '<div class="fg"><label class="flabel">Nota (opzionale)</label><input type="text" id="multi-note" class="finput" placeholder="es. chiusura automatica"></div>' +
    '<div id="multi-preview-list" style="max-height: 300px; overflow-y: auto; border: 1px solid #e5e3dc; border-radius: 8px; margin-top: 10px; padding: 8px;"></div>' +
    '<div id="multi-preview-count" style="font-size:.8rem;margin-top:.5rem;color:#2563eb"></div>';
  document.getElementById('multi-close-body').innerHTML = modalBody;
  var filterInput = document.getElementById('multi-filter');
  var updatePreview = function() {
    var filtro = filterInput.value.toLowerCase();
    var filtered = movimentiDaChiudere.filter(function(m) { return filtro === '' || m.descrizione.toLowerCase().includes(filtro); });
    _multiCloseMovements = filtered.map(function(m) { return m.id; });
    renderMultiCloseList(filtered);
  };
  filterInput.addEventListener('input', updatePreview);
  updatePreview();
  openModal('m-multi-close');
}
function renderMultiCloseList(movements) {
  var container = document.getElementById('multi-preview-list');
  var countSpan = document.getElementById('multi-preview-count');
  if (!container) return;
  if (!movements.length) {
    container.innerHTML = '<div style="text-align:center; padding: 1rem;">Nessun movimento corrispondente</div>';
    if (countSpan) countSpan.innerHTML = '';
    return;
  }
  var selectedCount = _multiCloseMovements.length;
  container.innerHTML = movements.map(function(m) {
    var isChecked = _multiCloseMovements.includes(m.id);
    return '<div style="display: flex; align-items: center; gap: 8px; padding: 6px; border-bottom: 1px solid #eee;">' +
      '<input type="checkbox" class="multi-close-checkbox" data-id="' + m.id + '" ' + (isChecked ? 'checked' : '') + '>' +
      '<span style="flex:1; font-size:0.8rem;"><strong>' + (m.data ? m.data.split('-').reverse().join('/') : '—') + '</strong> - ' + esc(m.descrizione) + ' - Residuo: € ' + fmt(movResiduo(m)) + '</span></div>';
  }).join('');
  if (countSpan) countSpan.innerHTML = '✅ ' + selectedCount + ' movimento/i selezionato/i (su ' + movements.length + ' filtrati)';
  document.querySelectorAll('.multi-close-checkbox').forEach(function(cb) {
    cb.addEventListener('change', function(e) {
      var movId = cb.getAttribute('data-id');
      if (cb.checked) { if (!_multiCloseMovements.includes(movId)) _multiCloseMovements.push(movId); }
      else { _multiCloseMovements = _multiCloseMovements.filter(function(id) { return id !== movId; }); }
      var totalChecked = _multiCloseMovements.length;
      var totalFiltered = movements.length;
      if (countSpan) countSpan.innerHTML = '✅ ' + totalChecked + ' movimento/i selezionato/i (su ' + totalFiltered + ' filtrati)';
    });
  });
}
function confirmMultiForcedClose() {
  var categoria = document.getElementById('multi-cat').value;
  var mod = document.getElementById('multi-mod').value;
  var nota = document.getElementById('multi-note').value.trim();
  if (!categoria) { toast('Seleziona una categoria', 'warn'); return; }
  if (!_multiCloseMovements.length) { toast('Nessun movimento selezionato', 'warn'); return; }
  var count = 0;
  for (var i = 0; i < _multiCloseMovements.length; i++) {
    var movId = _multiCloseMovements[i];
    var m = S.movimenti.find(function(x) { return x.id === movId; });
    if (!m) continue;
    var residuoM = movResiduo(m);
    if (residuoM <= 0) continue;
    var aggCassa = (mod === 'contanti');
    m.chiusureExtra = m.chiusureExtra || [];
    var nuovaChiusura = {
      id: uid(),
      data: m.data,
      imp: residuoM,
      nota: nota || 'Chiusura forzata multipla (' + categoria + ')',
      categoria: categoria,
      mod: mod,
      aggiornaCassa: aggCassa
    };
    m.chiusureExtra.push(nuovaChiusura);
    if (aggCassa) {
      var tipoCassa = m.uscita > 0 ? 'entrata' : 'uscita';
      var descCassa = (tipoCassa === 'entrata' ? 'Prelievo' : 'Versamento') + ' contanti: ' + (nota || m.descrizione);
      var idCassa = aggiornaCassa(residuoM, tipoCassa, descCassa, m.id, m.data);
      nuovaChiusura.idCassa = idCassa;
    }
    m.riconciliato = movRicTotale(m);
    count++;
  }
  save();
  renderMov();
  toast('✅ Chiusi forzatamente ' + count + ' movimento/i', 'success');
  closeModal('m-multi-close');
  _multiCloseMovements = [];
}

// ======================== REGOLE DI CHIUSURA AUTOMATICA ========================
// Regole salvate (parole chiave -> categoria/metodo) per chiudere in un colpo solo i movimenti
// ricorrenti senza documento (commissioni, F24, stipendi, assicurazioni...). Le regole sono
// persistite in S.regoleChiusura, quindi restano sulla chiavetta. La chiusura vera e propria va
// sempre confermata a mano dopo aver visto l'anteprima — nessuna scrittura automatica silenziosa.
function openAutoRulesModal() {
  var catSel = document.getElementById('regola-cat');
  var modSel = document.getElementById('regola-mod');
  if (catSel) catSel.innerHTML = Object.entries(EXTRA_CAT).map(function(e) { return '<option value="' + e[0] + '">' + e[1] + '</option>'; }).join('');
  if (modSel) modSel.innerHTML = Object.entries(getMOD()).filter(function(e) { return e[0]; }).map(function(e) { return '<option value="' + e[0] + '">' + e[1] + '</option>'; }).join('');
  renderRegoleChiusura();
  document.getElementById('auto-rules-preview').innerHTML = '<p style="color:#a8a29e">Premi "Scansiona movimenti" per vedere quali movimenti aperti corrispondono alle regole salvate.</p>';
  _autoRuleProposals = [];
  openModal('m-auto-rules');
}
function renderRegoleChiusura() {
  var tb = document.getElementById('tb-regole');
  if (!tb) return;
  var regole = S.regoleChiusura || [];
  if (!regole.length) {
    tb.innerHTML = '<tr><td colspan="4" class="empty-state">Nessuna regola definita. Aggiungine una qui sotto (es. "f24, agenzia entrate" → F24/Tasse).</td></tr>';
    return;
  }
  tb.innerHTML = regole.map(function(r, idx) {
    return '<tr><td>' + esc(r.pattern) + '</td><td>' + esc(EXTRA_CAT[r.categoria] || r.categoria) + '</td><td>' + esc(modLabel(r.mod)) + '</td>' +
      '<td><button class="ico" style="color:#dc2626" onclick="deleteRegolaChiusura(' + idx + ')">🗑️</button></td></tr>';
  }).join('');
}
function addRegolaChiusura() {
  var pattern = document.getElementById('regola-pattern').value.trim();
  var categoria = document.getElementById('regola-cat').value;
  var mod = document.getElementById('regola-mod').value;
  if (!pattern) { toast('Inserisci almeno una parola chiave', 'warn'); return; }
  S.regoleChiusura = S.regoleChiusura || [];
  S.regoleChiusura.push({ id: uid(), pattern: pattern, categoria: categoria, mod: mod });
  document.getElementById('regola-pattern').value = '';
  save();
  renderRegoleChiusura();
  toast('✅ Regola aggiunta', 'success');
}
window.deleteRegolaChiusura = function(idx) {
  S.regoleChiusura.splice(idx, 1);
  save();
  renderRegoleChiusura();
  toast('🗑️ Regola rimossa', 'info');
};
// Prima regola le cui parole chiave (separate da virgola, case-insensitive) compaiono nella
// descrizione del movimento vince — l'ordine delle regole salvate conta.
function matchRegolaChiusura(descrizione) {
  var desc = (descrizione || '').toLowerCase();
  var regole = S.regoleChiusura || [];
  for (var i = 0; i < regole.length; i++) {
    var keywords = regole[i].pattern.split(',').map(function(k) { return k.trim().toLowerCase(); }).filter(Boolean);
    if (keywords.some(function(k) { return desc.includes(k); })) return regole[i];
  }
  return null;
}
var _autoRuleProposals = [];
function scanAutoRules() {
  var regole = S.regoleChiusura || [];
  if (!regole.length) { toast('Definisci prima almeno una regola', 'warn'); return; }
  _autoRuleProposals = [];
  S.movimenti.forEach(function(m) {
    var residuoM = movResiduo(m);
    if (residuoM <= 0.01) return;
    var regola = matchRegolaChiusura(m.descrizione);
    if (regola) _autoRuleProposals.push({ movId: m.id, regola: regola });
  });
  renderAutoRulePreview();
}
function renderAutoRulePreview() {
  var body = document.getElementById('auto-rules-preview');
  if (!body) return;
  if (!_autoRuleProposals.length) {
    body.innerHTML = '<p style="color:#a8a29e;padding:1rem 0">Nessun movimento aperto corrisponde alle regole definite.</p>';
    return;
  }
  body.innerHTML = '<p style="margin-bottom:.5rem"><strong>' + _autoRuleProposals.length + '</strong> movimenti proposti per la chiusura — togli la spunta a quelli che non vanno bene, poi conferma.</p>' +
    '<div style="max-height:320px;overflow-y:auto;border:1px solid #e5e3dc;border-radius:8px;padding:.5rem">' +
    _autoRuleProposals.map(function(p, idx) {
      var m = S.movimenti.find(function(x) { return x.id === p.movId; });
      if (!m) return '';
      return '<div style="display:flex;align-items:center;gap:.5rem;padding:.4rem 0;border-bottom:1px solid #f0efe9">' +
        '<input type="checkbox" class="auto-rule-checkbox" data-idx="' + idx + '" checked>' +
        '<span style="flex:1;font-size:.82rem"><strong>' + (m.data ? m.data.split('-').reverse().join('/') : '—') + '</strong> · ' + esc(m.descrizione) + ' · € ' + fmt(movResiduo(m)) + '</span>' +
        '<span class="badge" style="background:#e0e7ff;color:#3730a3">' + esc(EXTRA_CAT[p.regola.categoria] || p.regola.categoria) + '</span>' +
        '</div>';
    }).join('') + '</div>';
}
function confirmAutoRules() {
  var checked = Array.from(document.querySelectorAll('.auto-rule-checkbox:checked')).map(function(cb) { return parseInt(cb.getAttribute('data-idx')); });
  if (!checked.length) { toast('Nessun movimento selezionato', 'warn'); return; }
  var count = 0;
  checked.forEach(function(idx) {
    var p = _autoRuleProposals[idx];
    if (!p) return;
    var m = S.movimenti.find(function(x) { return x.id === p.movId; });
    if (!m) return;
    var residuoM = movResiduo(m);
    if (residuoM <= 0.01) return;
    var aggCassa = (p.regola.mod === 'contanti');
    m.chiusureExtra = m.chiusureExtra || [];
    var nuovaChiusura = {
      id: uid(), data: m.data, imp: residuoM,
      nota: 'Chiusura automatica (regola: ' + p.regola.pattern + ')',
      categoria: p.regola.categoria, mod: p.regola.mod, aggiornaCassa: aggCassa
    };
    m.chiusureExtra.push(nuovaChiusura);
    if (aggCassa) {
      var tipoCassa = m.uscita > 0 ? 'entrata' : 'uscita';
      var descCassa = (tipoCassa === 'entrata' ? 'Prelievo' : 'Versamento') + ' contanti: ' + m.descrizione;
      nuovaChiusura.idCassa = aggiornaCassa(residuoM, tipoCassa, descCassa, m.id, m.data);
    }
    m.riconciliato = movRicTotale(m);
    count++;
  });
  save();
  renderMov();
  toast('✅ Chiusi automaticamente ' + count + ' movimento/i', 'success');
  closeModal('m-auto-rules');
  _autoRuleProposals = [];
}

// ======================== CSV ========================
var _csvParsed = null;
async function handleCSVUpload(ev) {
  var file = ev.target.files[0];
  if (!file) return;
  ev.target.value = '';
  var text = await file.text();
  var sep = detectSep(text);
  var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
  var headers = parseCSVLine(lines[0], sep).map(function(h) { return h.trim().toLowerCase(); });
  var rows = lines.slice(1).map(function(l) { return parseCSVLine(l, sep); }).filter(function(r) { return r.some(function(c) { return c.trim(); }); });
  _csvParsed = { headers: headers, rows: rows, sep: sep, fname: file.name };
  var map = autoDetectCols(headers);
  showCSVMapModal(headers, map, rows.slice(0, 3));
}
function detectSep(text) {
  var semi = (text.match(/;/g) || []).length;
  var comma = (text.match(/,/g) || []).length;
  return semi >= comma ? ';' : ',';
}
function parseCSVLine(line, sep) {
  var result = [];
  var cur = '', inQ = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (c === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === sep && !inQ) {
      result.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  result.push(cur.trim());
  return result;
}
function autoDetectCols(headers) {
  function find(kws) { return headers.findIndex(function(h) { return kws.some(function(k) { return h.includes(k); }); }); }
  return {
    data: find(['data op', 'data mov', 'data val', 'data', 'date']),
    desc: find(['descrizione', 'causale', 'description', 'dettagl', 'note', 'narrat']),
    acc: find(['accredito', 'avere', 'entrata', 'credit', 'in ']),
    add: find(['addebito', 'dare', 'uscita', 'debit', 'out ']),
    imp: find(['importo', 'amount', 'movimento', 'valore']),
  };
}
function showCSVMapModal(headers, map, preview) {
  var opts = headers.map(function(h, i) { return '<option value="' + i + '">' + esc(h) + '</option>'; }).join('');
  var noneOpt = '<option value="-1">— Non presente —</option>';
  function sel(label, key) {
    return '<div class="fg"><label class="flabel">' + label + '</label><select class="fselect" id="cmap-' + key + '">' + noneOpt + opts + '</select></div>';
  }
  var bancaOptions = S.banche.map(function(b) { return '<option value="' + b.id + '">' + esc(b.nome) + '</option>'; }).join('');
  var prevRows = preview.map(function(r) { return '<tr>' + r.map(function(c) { return '<td style="padding:.3rem .5rem;border:1px solid #e5e3dc;font-size:.75rem;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis">' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('');
  document.getElementById('csv-map-body').innerHTML = '<p style="font-size:.82rem;color:#78716c;margin-bottom:.75rem">File: <strong>' + esc(_csvParsed.fname) + '</strong> — ' + _csvParsed.rows.length + ' righe rilevate. Verifica il mapping delle colonne.</p>' +
    '<div class="fg2">' + sel('Colonna Data *', 'data') + sel('Colonna Descrizione *', 'desc') + sel('Accredito (entrata)', 'acc') + sel('Addebito (uscita)', 'add') + sel('Importo unico (±)', 'imp') + '</div>' +
    '<div class="fg"><label class="flabel">Banca di destinazione</label><select class="fselect" id="csv-banca">' + bancaOptions + '</select></div>' +
    '<p style="font-size:.75rem;color:#78716c;margin:.5rem 0">Se la banca usa una colonna importo unico (positivo=entrata, negativo=uscita), selezionala in "Importo unico". Altrimenti usa Accredito/Addebito separati.</p>' +
    '<div style="overflow-x:auto;max-height:120px;border:1px solid #e5e3dc;border-radius:6px"><table style="border-collapse:collapse;font-size:.75rem;width:100%"><thead><tr style="background:#f5f4f0">' + headers.map(function(h) { return '<th style="padding:.3rem .5rem;text-align:left;border:1px solid #e5e3dc;white-space:nowrap">' + esc(h) + '</th>'; }).join('') + '</thead><tbody>' + prevRows + '</tbody></table></div>';
  Object.entries(map).forEach(function(entry) { var el = document.getElementById('cmap-' + entry[0]); if (el) el.value = entry[1]; });
  openModal('m-csv');
}
// v2.22: accetta anche il formato anglosassone (1,234.50), che prima veniva letto come 1,234.
// Regola: se ci sono sia punto che virgola, l'ultimo è il decimale; con la sola virgola è decimale;
// con il solo punto è separatore delle migliaia solo nella forma 1.234 / 1.234.567.
function parseItalianNum(s) {
  if (!s) return 0;
  var str = String(s).trim();
  var neg = str.indexOf('-') !== -1 || /^\(.*\)$/.test(str);
  var clean = str.replace(/[^\d,.]/g, '');
  var lastComma = clean.lastIndexOf(','), lastDot = clean.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    var dec = lastComma > lastDot ? ',' : '.';
    clean = clean.split(dec === ',' ? '.' : ',').join('').replace(dec, '.');
  } else if (lastComma !== -1) {
    clean = clean.split('.').join('').replace(/,(?=.*,)/g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(clean)) {
    clean = clean.split('.').join('');
  }
  var v = parseFloat(clean) || 0;
  return neg ? -v : v;
}
function normalizeCsvText(s) {
  if (!s) return '';
  s = s.trim();
  s = s.replace(/\s+/g, ' ');
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return s;
}
function confirmCSVMap() {
  if (!_csvParsed) { closeModal('m-csv'); return; }
  var ci = {
    data: parseInt(document.getElementById('cmap-data').value),
    desc: parseInt(document.getElementById('cmap-desc').value),
    acc: parseInt(document.getElementById('cmap-acc').value),
    add: parseInt(document.getElementById('cmap-add').value),
    imp: parseInt(document.getElementById('cmap-imp').value),
  };
  var bancaId = document.getElementById('csv-banca').value;
  if (ci.data < 0 || ci.desc < 0) { toast('❌ Seleziona almeno Data e Descrizione', 'error'); return; }
  var added = 0, skipped = 0;
  // v2.22: un movimento è duplicato solo se era GIÀ presente prima di questo import. Si contano le
  // occorrenze, così reimportare lo stesso file non crea doppioni, ma due movimenti identici e
  // legittimi nello stesso file (es. due commissioni uguali lo stesso giorno) vengono entrambi
  // importati. Prima il secondo veniva scartato perché confrontato col primo appena aggiunto.
  function chiaveMov(data, desc, importo) { return data + '|' + desc + '|' + round2(importo).toFixed(2); }
  var esistenti = {};
  (S.movimenti || []).forEach(function(m) {
    var k = chiaveMov(m.data, m.descrizione, (m.entrata || 0) + (m.uscita || 0));
    esistenti[k] = (esistenti[k] || 0) + 1;
  });
  _csvParsed.rows.forEach(function(r) {
    var data = parseISODate(r[ci.data] || '');
    var descRaw = (r[ci.desc] || '').trim();
    var desc = normalizeCsvText(descRaw);
    if (!data || !desc) { skipped++; return; }
    var entrata = 0, uscita = 0;
    if (ci.imp >= 0) {
      var v = parseItalianNum(r[ci.imp]);
      if (v > 0) entrata = v;
      else if (v < 0) uscita = Math.abs(v);
    } else {
      if (ci.acc >= 0) entrata = Math.abs(parseItalianNum(r[ci.acc]));
      if (ci.add >= 0) uscita = Math.abs(parseItalianNum(r[ci.add]));
    }
    if (!entrata && !uscita) { skipped++; return; }
    var kDup = chiaveMov(data, desc, entrata + uscita);
    if (esistenti[kDup] > 0) { esistenti[kDup]--; skipped++; return; }
    S.movimenti.push({ id: uid(), data: data, descrizione: desc, entrata: round2(entrata), uscita: round2(uscita), riconciliato: 0, riconciliazioni: [], src: 'csv', bancaId: bancaId });
    added++;
  });
  _csvParsed = null;
  save(); renderMov(); closeModal('m-csv');
  toast('✅ ' + added + ' movimenti importati' + (skipped ? ' (' + skipped + ' saltati)' : ''), 'success');
}
function parseISODate(s) {
  if (!s) return '';
  s = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var d = s.replace(/[.\-\/]/g, '/').split('/');
  if (d.length !== 3) return '';
  if (d[2].length === 4) return d[2] + '-' + d[1].padStart(2, '0') + '-' + d[0].padStart(2, '0');
  if (d[0].length === 4) return d[0] + '-' + d[1].padStart(2, '0') + '-' + d[2].padStart(2, '0');
  return '';
}

// ======================== INTEGRITÀ DATI ========================
function checkIntegrity() {
  var changes = 0;
  // v2.22: una nota di credito compensata con una fattura NON ha una voce in nota.pagamenti — la
  // compensazione è registrata come pagamento (mod 'nota_credito', _notaId) sulla fattura. Senza
  // contarla qui, il ricalcolo azzerava il pagato della nota e la "riapriva" come credito disponibile.
  var compensazioniPerNota = {};
  [['a', S.a], ['p', S.p]].forEach(function(pair) {
    var t = pair[0];
    var docsTipo = pair[1].concat(((S.archive && S.archive.docs) || []).filter(function(d) { return d._originalType === t; }));
    docsTipo.forEach(function(doc) {
      (doc.pagamenti || []).forEach(function(p) {
        if (p._notaId) compensazioniPerNota[t + '_' + p._notaId] = (compensazioniPerNota[t + '_' + p._notaId] || 0) + (p.importo || 0);
      });
    });
  });
  [['a', S.a], ['p', S.p]].forEach(function(pair) {
    var t = pair[0], arr = pair[1];
    arr.forEach(function(doc) {
      var calcPagato = (doc.pagamenti || []).reduce(function(s, p) { return s + (p.importo || 0); }, 0);
      if (doc.tipo === 'nota_credito') calcPagato += compensazioniPerNota[t + '_' + doc.id] || 0;
      if (Math.abs((doc.pagato || 0) - calcPagato) > 0.01) {
        doc.pagato = round2(calcPagato);
        changes++;
      }
      if (doc.tipo === 'nota_credito') {
        if (doc.pagato > Math.abs(doc.tot)) {
          doc.pagato = Math.abs(doc.tot);
          changes++;
        }
      } else {
        if (doc.pagato > doc.tot) {
          doc.pagato = doc.tot;
          changes++;
        }
      }
    });
  });
  S.movimenti.forEach(function(mov) {
    if (mov.riconciliazioni) {
      mov.riconciliazioni = mov.riconciliazioni.filter(function(r) {
        // Un documento collegato può esistere ancora in due posti: nelle liste attive (S.a/S.p)
        // oppure, se è stato archiviato dopo essere stato saldato, in S.archive.docs. In entrambi
        // i casi il collegamento va mantenuto — va rimosso solo se il documento non esiste più da
        // nessuna parte (es. cancellato manualmente).
        var existsActive = (S[r.t] || []).some(function(d) { return d.id === r.id; });
        if (existsActive) return true;
        var existsArchived = S.archive && (S.archive.docs || []).some(function(d) { return d.id === r.id && d._originalType === r.t; });
        if (existsArchived) return true;
        changes++;
        return false;
      });
    }
    mov.riconciliato = movRicTotale(mov);
  });
  if (changes > 0) {
    console.log('checkIntegrity: corrette ' + changes + ' incongruenze');
    save();
  }
  return changes;
}

// ======================== BACKUP AUTOMATICI ========================
// Due livelli:
// 1) localStorage — rete di sicurezza minima, ma NON viaggia con la chiavetta: è legato al
//    browser/PC su cui viene generato il backup.
// 2) Sottocartella "backup/" dentro la cartella dati stessa, quando l'app è in modalità "dir"
//    (Directory Picker): così il backup di rotazione resta sulla chiavetta USB insieme ai dati,
//    e funziona anche aprendo l'app da un altro PC/browser.
var BACKUP_KEEP_DAYS = 30;
var BACKUP_DIR = 'backup';
var BACKUP_LS_KEEP = 2; // v2.22: ogni backup pesa ~1,3 MB e localStorage ha ~5 MB: 30 giorni non ci stanno
function statoVuoto() {
  return !S.a.length && !S.p.length && !(S.movimenti || []).length && !((S.archive && S.archive.docs) || []).length;
}
async function backupAuto() {
  // v2.22: mai salvare come backup lo stato vuoto (es. all'avvio, prima di "Apri Dati"): prima
  // sovrascriveva il backup del giorno con dati vuoti.
  if (statoVuoto()) return false;
  var now = new Date();
  var todayStr = now.toISOString().slice(0, 10);
  var dataStr = stateToJSON();

  try {
    // Pulizia PRIMA della scrittura: prima avveniva dopo setItem, che una volta pieno lo spazio
    // falliva sempre, quindi lo spazio non veniva mai liberato e nessun backup nuovo veniva scritto.
    var backupKeys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf('fmp_backup_') === 0) backupKeys.push(key);
    }
    var daTenere = backupKeys.filter(function(k) { return /^fmp_backup_\d{4}-\d{2}-\d{2}$/.test(k) && k !== 'fmp_backup_' + todayStr; })
      .sort().reverse().slice(0, BACKUP_LS_KEEP - 1);
    backupKeys.forEach(function(k) { if (k !== 'fmp_backup_' + todayStr && daTenere.indexOf(k) === -1) localStorage.removeItem(k); });
    try {
      localStorage.setItem('fmp_backup_' + todayStr, dataStr);
    } catch (eQuota) {
      // Spazio ancora insufficiente: sacrifica i backup più vecchi e riprova una volta.
      daTenere.forEach(function(k) { localStorage.removeItem(k); });
      localStorage.setItem('fmp_backup_' + todayStr, dataStr);
    }
  } catch (e) { console.error('backupAuto (localStorage):', e); }

  if (STOR === 'dir' && _dir) {
    try {
      var backupDir = await _dir.getDirectoryHandle(BACKUP_DIR, { create: true });
      var fh = await backupDir.getFileHandle('backup-' + todayStr + '.json', { create: true });
      var w = await fh.createWritable();
      await w.write(dataStr);
      await w.close();
      for await (var entry of backupDir.entries()) {
        var name = entry[0];
        var mtch = name.match(/^backup-(\d{4}-\d{2}-\d{2})\.json$/);
        if (!mtch) continue;
        var diffDaysUsb = (now - new Date(mtch[1])) / (1000 * 3600 * 24);
        if (diffDaysUsb > BACKUP_KEEP_DAYS) { await backupDir.removeEntry(name).catch(function() {}); }
      }
    } catch (e) { console.error('backupAuto (USB):', e); }
  }
  return true;
}
// v2.22: backup giornaliero eseguito solo quando ci sono dati veri (anche subito dopo "Apri Dati").
async function backupGiornalieroSeNecessario() {
  var todayDate = new Date().toISOString().slice(0, 10);
  try { if (localStorage.getItem('fmp_last_backup_date') === todayDate) return; } catch (e) {}
  var fatto = await backupAuto();
  if (fatto) { try { localStorage.setItem('fmp_last_backup_date', todayDate); } catch (e) {} }
}
setInterval(function() { backupAuto(); }, 24 * 3600 * 1000);

// ======================== NUOVE FUNZIONI PER ARCHIVIO ========================
function buildArchiveTH(type) {
  var col = sortArchive[type].col, dir = sortArchive[type].dir;
  var thId = type === 'a' ? 'th-arch-a' : 'th-arch-p';
  var th = document.getElementById(thId);
  if (!th) return;
  th.innerHTML = COLS.map(function(c) {
    var arrow = '';
    if (c.sort) {
      arrow = '<span class="sort-arrow">' + (c.k === col ? (dir === 'asc' ? '▲' : '▼') : '↕') + '</span>';
    }
    return '<th class="' + (c.k === col ? 'sorted' : '') + '" style="' + (c.w ? 'width:' + c.w : '') + '" onclick="' + (c.sort ? 'doSortArchive(\'' + type + '\',\'' + c.k + '\')' : '') + '" >' + c.l + arrow + '</th>';
  }).join('');
  var firstRow = th.parentElement;
  var newTh = document.createElement('th');
  newTh.style.width = '28px';
  newTh.innerHTML = '<input type="checkbox" id="select-all-arch-' + type + '" onchange="toggleSelectAllArchiveDocs(\'' + type + '\')">';
  th.prepend(newTh);
}
function doSortArchive(type, col) {
  if (sortArchive[type].col === col) sortArchive[type].dir = sortArchive[type].dir === 'asc' ? 'desc' : 'asc';
  else { sortArchive[type].col = col; sortArchive[type].dir = 'asc'; }
  renderArchiveDocs(type);
  savePreferences();
}
function getArchiveDocsSorted(type) {
  var q = (document.getElementById('srch-arch-' + type) || { value: '' }).value.toLowerCase();
  var da = (document.getElementById('fda-arch-' + type) ? document.getElementById('fda-arch-' + type).value : '');
  var db = (document.getElementById('fdb-arch-' + type) ? document.getElementById('fdb-arch-' + type).value : '');
  var fst = (document.getElementById('fst-arch-' + type) ? document.getElementById('fst-arch-' + type).value : '');
  var fmod = (document.getElementById('fmod-arch-' + type) ? document.getElementById('fmod-arch-' + type).value : '');
  var period = (document.getElementById('period-arch-' + type) ? document.getElementById('period-arch-' + type).value : 'all');
  var data = (S.archive.docs || []).filter(function(d) { return d._originalType === type; });
  data = data.filter(function(i) {
    if (q && !i.rs.toLowerCase().includes(q) && !String(i.num || '').toLowerCase().includes(q) && !(i.note && i.note.toLowerCase().includes(q))) return false;
    if (da && (i.data || '') < da) return false;
    if (db && (i.data || '') > db) return false;
    if (fst && statusOf(i) !== fst) return false;
    if (fmod) { var matchPag = (i.pagamenti || []).some(function(p) { return p.mod === fmod; }); if (i.modpag !== fmod && !matchPag) return false; }
    if (period !== 'all' && !matchPeriod(i.data, period)) return false;
    return true;
  });
  var col = sortArchive[type].col, dir = sortArchive[type].dir;
  var sign = dir === 'asc' ? 1 : -1;
  data.sort(function(a, b) {
    var cmp = 0;
    if (col === 'num') cmp = naturalCmp(a.num, b.num) * sign;
    else if (['imp', 'totiva', 'tot', 'pagato'].includes(col)) cmp = ((a[col]||0) - (b[col]||0)) * sign;
    else if (col === 'res') cmp = (residuo(a) - residuo(b)) * sign;
    else if (col === 'valuta') cmp = (a.valuta || 'EUR').localeCompare(b.valuta || 'EUR') * sign;
    else { var av = String(a[col]||'').toLowerCase(), bv = String(b[col]||'').toLowerCase(); cmp = (av < bv ? -1 : av > bv ? 1 : 0) * sign; }
    if (cmp === 0) cmp = (b.data || '').localeCompare(a.data || '');
    return cmp;
  });
  var countSpan = document.getElementById('fcount-arch-' + type);
  if (countSpan) countSpan.textContent = data.length + ' fatture';
  return data;
}
function renderArchiveDocs(type) {
  buildArchiveTH(type);
  var data = getArchiveDocsSorted(type);
  var tb = document.getElementById('tb-arch-' + type);
  var tf = document.getElementById('tf-arch-' + type);
  if (!tb) return;
  if (!data.length) {
    tb.innerHTML = '<tr><td colspan="' + (COLS.length+1) + '" class="empty-state">📄 Nessuna fattura archiviata</td></tr>';
    if (tf) tf.innerHTML = '';
    return;
  }
  tb.innerHTML = data.map(function(i) { return archiveRow(i, type); }).join('');
  if (tf) renderArchiveTotals(type, data);
}
function archiveRow(i, type) {
  var selectedSet = type === 'a' ? _selectedArchiveDocsA : _selectedArchiveDocsP;
  var checked = selectedSet.has(i.id) ? 'checked' : '';
  var st = statusOf(i);
  var res = residuo(i);
  var pdfIcon = i.hasPdf ? '<button class="ico" style="color:#2563eb;font-size:1rem" onclick="openPDFArchive(\'' + i.id + '\',\'' + type + '\')">📄</button>' : '—';
  return '<tr>' +
    '<td style="text-align:center"><input type="checkbox" class="archive-doc-checkbox" data-id="' + i.id + '" data-type="' + type + '" ' + checked + ' onchange="toggleArchiveDocSelection(\'' + i.id + '\',\'' + type + '\')"></td>' +
    '<td style="text-align:center"><span class="dot dot-' + st + '" title="' + (st === 'r' ? 'Da pagare' : st === 'y' ? 'Parziale' : 'Pagata') + '"></span></td>' +
    '<td>' + tipoBadge(i.tipo) + badgeRitSplit(i) + '</td>' +
    '<td><strong>' + esc(i.rs) + '</strong></td>' +
    '<td>' + esc(i.num) + '</td>' +
    '<td>' + (i.data ? i.data.split('-').reverse().join('/') : '—') + '</td>' +
    '<td>' + (i.scad ? i.scad.split('-').reverse().join('/') : '—') + '</td>' +
    '<td class="num">€ ' + fmt(i.imp) + '</td>' +
    '<td class="num">' + (i.aliq || '—') + '</td>' +
    '<td class="num">€ ' + fmt(i.totiva) + '</td>' +
    '<td class="num"><strong>€ ' + fmt(i.tot) + '</strong></td>' +
    '<td class="num">' + (i.valuta || 'EUR') + '</td>' +
    '<td>' + pagamentiCell(i) + '</td>' +
    '<td class="num">€ ' + fmt(res) + '</td>' +
    '<td>' + pdfIcon + '</td>' +
    '<td><button class="ico" style="color:#16a34a" onclick="restoreSingleArchiveDoc(\'' + i.id + '\',\'' + type + '\')" title="Ripristina">⬅️</button></td>' +
    '</tr>';
}
function renderArchiveTotals(type, data) {
  var tf = document.getElementById('tf-arch-' + type);
  if (!tf) return;
  var ti = round2(data.reduce(function(s,i) { return s + (i.imp||0); }, 0));
  var tv = round2(data.reduce(function(s,i) { return s + (i.totiva||0); }, 0));
  var tt = round2(data.reduce(function(s,i) { return s + (i.tot||0); }, 0));
  var tr = round2(data.reduce(function(s,i) { return s + residuo(i); }, 0));
  var cells = '<td colspan="2"></td>' +
    '<td><span class="tf-lbl">Fatture</span><span class="tf-val tf-n">' + data.length + '</span></td>' +
    '<td class="num"><span class="tf-lbl">Imponibile</span><span class="tf-val">€ ' + fmt(ti) + '</span></td>' +
    '<td class="num"><span class="tf-lbl">Tot. IVA</span><span class="tf-val">€ ' + fmt(tv) + '</span></td>' +
    '<td class="num"><span class="tf-lbl">Totale Doc.</span><span class="tf-val">€ ' + fmt(tt) + '</span></td>' +
    '<td colspan="5"></td>' +
    '<td class="num"><span class="tf-lbl">Residuo</span><span class="tf-val">€ ' + fmt(tr) + '</span></td>' +
    '<td colspan="2"></td>';
  tf.innerHTML = '<tr>' + cells + '</tr>';
}
function clearArchiveFilter(type) {
  document.getElementById('srch-arch-' + type).value = '';
  document.getElementById('fda-arch-' + type).value = '';
  document.getElementById('fdb-arch-' + type).value = '';
  document.getElementById('period-arch-' + type).value = 'all';
  document.getElementById('fmod-arch-' + type).value = '';
  document.getElementById('fst-arch-' + type).value = '';
  renderArchiveDocs(type);
}
function toggleArchiveDocSelection(id, type) {
  var set = type === 'a' ? _selectedArchiveDocsA : _selectedArchiveDocsP;
  if (set.has(id)) set.delete(id);
  else set.add(id);
  renderArchiveDocs(type);
}
function toggleSelectAllArchiveDocs(type) {
  var cb = document.getElementById('select-all-arch-' + type);
  var data = (S.archive.docs || []).filter(function(d) { return d._originalType === type; });
  var set = type === 'a' ? _selectedArchiveDocsA : _selectedArchiveDocsP;
  if (cb.checked) {
    data.forEach(function(d) { set.add(d.id); });
  } else {
    data.forEach(function(d) { set.delete(d.id); });
  }
  renderArchiveDocs(type);
}
function buildArchiveMovTH() {
  var col = sortArchive.m.col, dir = sortArchive.m.dir;
  var th = document.getElementById('th-arch-m');
  if (!th) return;
  th.innerHTML = COLS_MOV.map(function(c) {
    var arrow = '';
    if (c.sort) {
      arrow = '<span class="sort-arrow">' + (c.k === col ? (dir === 'asc' ? '▲' : '▼') : '↕') + '</span>';
    }
    return '<th class="' + (c.k === col ? 'sorted' : '') + '" style="' + (c.w ? 'width:' + c.w : '') + '" onclick="' + (c.sort ? 'doSortArchiveMov(\'' + c.k + '\')' : '') + '" >' + c.l + arrow + '</th>';
  }).join('');
  var firstRow = th.parentElement;
  var newTh = document.createElement('th');
  newTh.style.width = '28px';
  newTh.innerHTML = '<input type="checkbox" id="select-all-arch-m" onchange="toggleSelectAllArchiveMovs()">';
  th.prepend(newTh);
}
function doSortArchiveMov(col) {
  if (sortArchive.m.col === col) sortArchive.m.dir = sortArchive.m.dir === 'asc' ? 'desc' : 'asc';
  else { sortArchive.m.col = col; sortArchive.m.dir = 'asc'; }
  renderArchiveMovs();
  savePreferences();
}
function getArchiveMovsSorted() {
  var q = (document.getElementById('srch-arch-m') ? document.getElementById('srch-arch-m').value : '').toLowerCase();
  var da = (document.getElementById('fda-arch-m') ? document.getElementById('fda-arch-m').value : '');
  var db = (document.getElementById('fdb-arch-m') ? document.getElementById('fdb-arch-m').value : '');
  var ftip = (document.getElementById('ftip-arch-m') ? document.getElementById('ftip-arch-m').value : '');
  var frec = (document.getElementById('frec-arch-m') ? document.getElementById('frec-arch-m').value : '');
  var bancaFiltro = (document.getElementById('f-banca-arch-m') ? document.getElementById('f-banca-arch-m').value : '');
  var data = S.archive.movimenti || [];
  data = data.filter(function(m) {
    if (q && !(m.descrizione || '').toLowerCase().includes(q)) return false;
    if (da && (m.data || '') < da) return false;
    if (db && (m.data || '') > db) return false;
    if (ftip === 'e' && !(m.entrata > 0)) return false;
    if (ftip === 'u' && !(m.uscita > 0)) return false;
    if (frec) {
      var st = movStatus(m);
      if (frec === 'no' && st !== 'no') return false;
      if (frec === 'par' && st !== 'par') return false;
      if (frec === 'ok' && st !== 'ok') return false;
      if (frec === 'forzato' && st !== 'forzato') return false;
    }
    if (bancaFiltro && m.bancaId !== bancaFiltro) return false;
    return true;
  });
  var col = sortArchive.m.col, dir = sortArchive.m.dir;
  data.sort(function(a, b) {
    var av, bv;
    if (col === 'residuo') { av = movResiduo(a); bv = movResiduo(b); }
    else if (col === 'entrata') { av = a.entrata || 0; bv = b.entrata || 0; }
    else if (col === 'uscita') { av = a.uscita || 0; bv = b.uscita || 0; }
    else if (col === 'riconciliato') { av = movRicTotale(a); bv = movRicTotale(b); }
    else if (col === 'banca') {
      var bancaA = (S.banche.find(function(b) { return b.id === a.bancaId; }) || {}).nome || '';
      var bancaB = (S.banche.find(function(x) { return x.id === b.bancaId; }) || {}).nome || '';
      av = bancaA; bv = bancaB;
    }
    else { av = a[col] || ''; bv = b[col] || ''; }
    if (typeof av === 'number') return (av - bv) * (dir === 'asc' ? 1 : -1);
    return String(av).localeCompare(String(bv)) * (dir === 'asc' ? 1 : -1);
  });
  var countSpan = document.getElementById('fcount-arch-m');
  if (countSpan) countSpan.textContent = data.length + ' movimenti';
  return data;
}
function renderArchiveMovs() {
  buildArchiveMovTH();
  var data = getArchiveMovsSorted();
  var tb = document.getElementById('tb-arch-m');
  var tf = document.getElementById('tf-arch-m');
  if (!tb) return;
  if (!data.length) {
    tb.innerHTML = '<tr><td colspan="' + (COLS_MOV.length+1) + '" class="empty-state">🏦 Nessun movimento archiviato</td></tr>';
    if (tf) tf.innerHTML = '';
    return;
  }
  tb.innerHTML = data.map(function(m) { return archiveRowMov(m); }).join('');
  if (tf) renderArchiveMovTotals(data);
}
function archiveRowMov(m) {
  var st = movStatus(m);
  var dotCls = { ok: 'dot-g', par: 'dot-y', no: 'dot-r', forzato: 'dot-b' }[st] || 'dot-r';
  var res = movResiduo(m);
  var isIn = m.entrata > 0;
  var nomeBanca = (S.banche.find(function(b) { return b.id === m.bancaId; }) || {}).nome || '—';
  var recLinks = (m.riconciliazioni || []).map(function(r) {
    var inv = (S.archive.docs || []).find(function(i) { return i.id === r.id; });
    return '<div class="rec-link"><span class="rl-rs" title="' + (inv ? esc(inv.rs) : r.id) + '">' + (inv ? esc(inv.rs.slice(0, 20)) : r.id) + '</span><span class="rl-amt">€ ' + fmt(r.imp) + '</span></div>';
  });
  var extraLinks = (m.chiusureExtra || []).map(function(c) {
    return '<div class="rec-link"><span class="rl-rs" title="' + esc(c.nota || '') + '">' + esc((EXTRA_CAT[c.categoria] || c.categoria || 'Extra').slice(0, 18)) + '</span><span class="rl-amt">€ ' + fmt(c.imp) + '</span></div>';
  });
  var linksHtml = (recLinks.length + extraLinks.length) ? '<div class="rec-links">' + recLinks.concat(extraLinks).join('') + '</div>' : '<span style="color:#a8a29e;font-size:.78rem">—</span>';
  var resBadge = res <= 0 ? '<span class="res res-0">✓</span>' : '<span class="res ' + (isIn ? '' : 'res-pos') + '">€ ' + fmt(res) + '</span>';
  var descLinked = linkify(esc(m.descrizione));
  var checked = _selectedArchiveMovs.has(m.id) ? 'checked' : '';
  var statusTitle = { ok: 'Riconciliato', par: 'Parziale', no: 'Da riconciliare', forzato: 'Chiuso forzatamente' }[st];
  return '<tr>' +
    '<td style="text-align:center"><input type="checkbox" class="archive-mov-checkbox" data-id="' + m.id + '" ' + checked + ' onchange="toggleArchiveMovSelection(\'' + m.id + '\')"></td>' +
    '<td style="text-align:center"><span class="dot ' + dotCls + '" title="' + statusTitle + '"></span></td>' +
    '<td style="white-space:nowrap">' + (m.data ? m.data.split('-').reverse().join('/') : '—') + '</td>' +
    '<td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem" title="' + esc(m.descrizione) + '">' + descLinked + '</td>' +
    '<td class="num">' + (isIn ? '€ ' + fmt(m.entrata) : '—') + '</td>' +
    '<td class="num">' + (m.uscita > 0 ? '€ ' + fmt(m.uscita) : '—') + '</td>' +
    '<td class="num">€ ' + fmt(movRicTotale(m)) + '</td>' +
    '<td class="num">' + resBadge + '</td>' +
    '<td class="num">' + esc(nomeBanca) + '</td>' +
    '<td>' + linksHtml + '</td>' +
    '<td><button class="ico" style="color:#16a34a" onclick="restoreSingleArchiveMov(\'' + m.id + '\')" title="Ripristina">⬅️</button></td>' +
    '</tr>';
}
function renderArchiveMovTotals(data) {
  var tf = document.getElementById('tf-arch-m');
  if (!tf) return;
  var te = round2(data.filter(function(m) { return m.entrata > 0; }).reduce(function(s, m) { return s + m.entrata; }, 0));
  var tu = round2(data.filter(function(m) { return m.uscita > 0; }).reduce(function(s, m) { return s + m.uscita; }, 0));
  var tr2 = round2(data.reduce(function(s, m) { return s + movRicTotale(m); }, 0));
  var tres = round2(data.reduce(function(s, m) { return s + movResiduo(m); }, 0));
  var cells = '<td colspan="2"></td><td><span class="tf-lbl">Movimenti</span><span class="tf-val tf-n">' + data.length + '</span></td>' +
    '<td class="num"><span class="tf-lbl">Tot. Entrate</span><span class="tf-val" style="color:#4ade80">€ ' + fmt(te) + '</span></td>' +
    '<td class="num"><span class="tf-lbl">Tot. Uscite</span><span class="tf-val" style="color:#fca5a5">€ ' + fmt(tu) + '</span></td>' +
    '<td class="num"><span class="tf-lbl">Riconciliato</span><span class="tf-val">€ ' + fmt(tr2) + '</span></td>' +
    '<td class="num"><span class="tf-lbl">Residuo</span><span class="tf-val" style="color:#fde68a">€ ' + fmt(tres) + '</span></td>' +
    '<td colspan="2"></td>';
  tf.innerHTML = '<tr>' + cells + '</tr>';
}
function clearArchiveMovFilter() {
  document.getElementById('srch-arch-m').value = '';
  document.getElementById('fda-arch-m').value = '';
  document.getElementById('fdb-arch-m').value = '';
  document.getElementById('ftip-arch-m').value = '';
  document.getElementById('frec-arch-m').value = '';
  document.getElementById('f-banca-arch-m').value = '';
  renderArchiveMovs();
}
function toggleArchiveMovSelection(id) {
  if (_selectedArchiveMovs.has(id)) _selectedArchiveMovs.delete(id);
  else _selectedArchiveMovs.add(id);
  renderArchiveMovs();
}
function toggleSelectAllArchiveMovs() {
  var cb = document.getElementById('select-all-arch-m');
  var data = S.archive.movimenti || [];
  if (cb.checked) {
    data.forEach(function(m) { _selectedArchiveMovs.add(m.id); });
  } else {
    _selectedArchiveMovs.clear();
  }
  renderArchiveMovs();
}
async function restoreRelatedMovements(doc) {
  var movsToRestore = S.archive.movimenti.filter(function(m) {
    return m.riconciliazioni && m.riconciliazioni.some(function(r) { return r.id === doc.id && r.t === doc._originalType; });
  });
  var restored = 0;
  for (var i = 0; i < movsToRestore.length; i++) {
    var mov = movsToRestore[i];
    var idx = S.archive.movimenti.findIndex(function(m) { return m.id === mov.id; });
    if (idx !== -1) {
      delete mov._archivedOn;
      S.movimenti.push(mov);
      S.archive.movimenti.splice(idx,1);
      restored++;
    }
  }
  return restored;
}
async function restoreRelatedDocs(mov) {
  var docsToRestore = S.archive.docs.filter(function(doc) {
    return mov.riconciliazioni && mov.riconciliazioni.some(function(r) { return r.id === doc.id && r.t === doc._originalType; });
  });
  var restored = 0;
  for (var i = 0; i < docsToRestore.length; i++) {
    var doc = docsToRestore[i];
    var idx = S.archive.docs.findIndex(function(d) { return d.id === doc.id; });
    if (idx !== -1) {
      delete doc._archivedOn;
      var tipoOrig = doc._originalType;
      delete doc._originalType;
      if (tipoOrig === 'a') S.a.push(doc);
      else S.p.push(doc);
      S.archive.docs.splice(idx,1);
      restored++;
    }
  }
  return restored;
}
async function restoreSingleArchiveDoc(id, type) {
  var idx = S.archive.docs.findIndex(function(d) { return d.id === id && d._originalType === type; });
  if (idx === -1) return;
  var doc = S.archive.docs[idx];
  delete doc._archivedOn;
  if (type === 'a') S.a.push(doc);
  else S.p.push(doc);
  S.archive.docs.splice(idx,1);
  // v2.22: _originalType va letto da restoreRelatedMovements, quindi si cancella DOPO (prima le
  // fatture attive non riportavano indietro i loro movimenti).
  var restoredMovs = await restoreRelatedMovements(doc);
  delete doc._originalType;
  save();
  render('a'); render('p'); renderMov(); renderArchiveDocs('a'); renderArchiveDocs('p'); renderArchiveMovs();
  toast('✅ Fattura ripristinata (e ' + restoredMovs + ' movimenti collegati)', 'success');
}
async function restoreSingleArchiveMov(id) {
  var idx = S.archive.movimenti.findIndex(function(m) { return m.id === id; });
  if (idx === -1) return;
  var mov = S.archive.movimenti[idx];
  delete mov._archivedOn;
  S.movimenti.push(mov);
  S.archive.movimenti.splice(idx,1);
  var restoredDocs = await restoreRelatedDocs(mov);
  save();
  render('a'); render('p'); renderMov(); renderArchiveDocs('a'); renderArchiveDocs('p'); renderArchiveMovs();
  toast('✅ Movimento ripristinato (e ' + restoredDocs + ' fatture collegate)', 'success');
}
async function restoreSelectedArchiveDocs(type) {
  var set = type === 'a' ? _selectedArchiveDocsA : _selectedArchiveDocsP;
  if (set.size === 0) { toast('Nessuna fattura selezionata', 'warn'); return; }
  var countDocs = 0, countMovs = 0;
  for (var id of set) {
    var idx = S.archive.docs.findIndex(function(d) { return d.id === id && d._originalType === type; });
    if (idx !== -1) {
      var doc = S.archive.docs[idx];
      delete doc._archivedOn;
      if (type === 'a') S.a.push(doc);
      else S.p.push(doc);
      S.archive.docs.splice(idx,1);
      countDocs++;
      countMovs += await restoreRelatedMovements(doc);
      delete doc._originalType; // v2.22: dopo restoreRelatedMovements, che lo usa
    }
  }
  set.clear();
  save();
  render('a'); render('p'); renderMov(); renderArchiveDocs('a'); renderArchiveDocs('p'); renderArchiveMovs();
  toast('✅ Ripristinate ' + countDocs + ' fatture e ' + countMovs + ' movimenti collegati', 'success');
}
async function restoreSelectedArchiveMovs() {
  if (_selectedArchiveMovs.size === 0) { toast('Nessun movimento selezionato', 'warn'); return; }
  var countMovs = 0, countDocs = 0;
  for (var id of _selectedArchiveMovs) {
    var idx = S.archive.movimenti.findIndex(function(m) { return m.id === id; });
    if (idx !== -1) {
      var mov = S.archive.movimenti[idx];
      delete mov._archivedOn;
      S.movimenti.push(mov);
      S.archive.movimenti.splice(idx,1);
      countMovs++;
      countDocs += await restoreRelatedDocs(mov);
    }
  }
  _selectedArchiveMovs.clear();
  save();
  render('a'); render('p'); renderMov(); renderArchiveDocs('a'); renderArchiveDocs('p'); renderArchiveMovs();
  toast('✅ Ripristinati ' + countMovs + ' movimenti e ' + countDocs + ' fatture collegate', 'success');
}
function exportArchive() {
  if (!S.archive || (S.archive.docs.length === 0 && S.archive.movimenti.length === 0)) {
    toast('Archivio vuoto', 'warn');
    return;
  }
  var dataStr = JSON.stringify(S.archive, null, 2);
  var blob = new Blob([dataStr], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'fatturemanager_archive_' + new Date().toISOString().slice(0,19) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('📤 Archivio esportato', 'success');
}
function importArchive() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var text = await file.text();
    try {
      var imported = JSON.parse(text);
      if (!imported.docs || !imported.movimenti) throw new Error();
      if (!confirm('Sostituire l\'archivio corrente (' + S.archive.docs.length + ' fatture, ' + S.archive.movimenti.length + ' movimenti) con quello importato (' + imported.docs.length + ' fatture, ' + imported.movimenti.length + ' movimenti)?')) return;
      S.archive = imported;
      save();
      renderArchiveDocs('a'); renderArchiveDocs('p'); renderArchiveMovs();
      toast('✅ Archivio importato', 'success');
    } catch (err) {
      toast('❌ File non valido', 'error');
    }
  };
  input.click();
}

// ======================== ROLLOVER ========================
// Un documento non va archiviato se un movimento che RESTA attivo (non archiviato in questo
// stesso rollover) lo referenzia ancora in m.riconciliazioni: altrimenti quel movimento, riaperto
// in seguito, non troverebbe più il documento collegato ("documento non trovato") pur avendo
// l'importo già correttamente registrato.
function getRolloverExclusions(cutoff) {
  var refs = new Set();
  S.movimenti.forEach(function(m) {
    var vieneArchiviato = movResiduo(m) === 0 && m.data <= cutoff;
    if (vieneArchiviato) return;
    (m.riconciliazioni || []).forEach(function(r) { refs.add(r.t + '_' + r.id); });
  });
  return refs;
}
function openRolloverModal() {
  // Verifica di integrità dedicata prima del rollover: ricalcola pagato/residuo e ripulisce
  // eventuali riferimenti realmente orfani, così l'anteprima e l'archiviazione partono da dati puliti.
  var fixed = checkIntegrity();
  var lastYear = new Date().getFullYear() - 1;
  var defaultCutoff = lastYear + '-12-31';
  var cutoffInput = document.getElementById('rollover-cutoff');
  if (cutoffInput) cutoffInput.value = defaultCutoff;
  updateRolloverPreview();
  openModal('m-rollover');
  if (fixed > 0) toast('🔍 Verifica integrità: corrette ' + fixed + ' incongruenze prima del rollover', 'info');
}
function updateRolloverPreview() {
  var cutoff = document.getElementById('rollover-cutoff').value;
  if (!cutoff) return;
  var excluded = getRolloverExclusions(cutoff);
  var docsToArchive = 0, movToArchive = 0, docsEsclusi = 0;
  var esclA = S.a.filter(function(inv) { return residuo(inv) === 0 && inv.data <= cutoff && excluded.has('a_' + inv.id); }).length;
  var esclP = S.p.filter(function(inv) { return residuo(inv) === 0 && inv.data <= cutoff && excluded.has('p_' + inv.id); }).length;
  docsEsclusi = esclA + esclP;
  docsToArchive += S.a.filter(function(inv) { return residuo(inv) === 0 && inv.data <= cutoff && !excluded.has('a_' + inv.id); }).length;
  docsToArchive += S.p.filter(function(inv) { return residuo(inv) === 0 && inv.data <= cutoff && !excluded.has('p_' + inv.id); }).length;
  movToArchive = S.movimenti.filter(function(m) { return movResiduo(m) === 0 && m.data <= cutoff; }).length;
  var previewDiv = document.getElementById('rollover-preview');
  if (previewDiv) {
    previewDiv.innerHTML = '<p>📄 <strong>Fatture da archiviare:</strong> ' + docsToArchive + '</p>' +
      '<p>🏦 <strong>Movimenti bancari da archiviare:</strong> ' + movToArchive + '</p>' +
      (docsEsclusi ? '<p>ℹ️ <strong>' + docsEsclusi + '</strong> fattura/e saldate ma ancora collegate a movimenti recenti (non archiviate per mantenere il collegamento)</p>' : '') +
      '<p style="margin-top:0.5rem; font-size:0.8rem; color:#f59e0b;">⚠️ I dati archiviati saranno rimossi dalle viste attive e spostati nell\'archivio. La cassa contanti rimane invariata.</p>';
  }
}
function confirmRollover() {
  var cutoff = document.getElementById('rollover-cutoff').value;
  if (!cutoff) { toast('Seleziona una data di cutoff', 'error'); return; }
  checkIntegrity(); // ultima verifica, per sicurezza, subito prima di spostare i dati in archivio
  if (!S.archive) S.archive = { docs: [], movimenti: [] };
  var excluded = getRolloverExclusions(cutoff);
  var toArchiveA = S.a.filter(function(inv) { return residuo(inv) === 0 && inv.data <= cutoff && !excluded.has('a_' + inv.id); });
  var toArchiveP = S.p.filter(function(inv) { return residuo(inv) === 0 && inv.data <= cutoff && !excluded.has('p_' + inv.id); });
  S.archive.docs.push.apply(S.archive.docs, toArchiveA.map(function(d) { return Object.assign({}, d, { _archivedOn: new Date().toISOString(), _originalType: 'a' }); }));
  S.archive.docs.push.apply(S.archive.docs, toArchiveP.map(function(d) { return Object.assign({}, d, { _archivedOn: new Date().toISOString(), _originalType: 'p' }); }));
  // v2.22: rimuove dalle liste attive SOLO i documenti effettivamente copiati in archivio. Prima
  // venivano rimossi tutti i saldati <= cutoff, compresi quelli esclusi sopra, che così sparivano.
  var archiviatiA = new Set(toArchiveA.map(function(d) { return d.id; }));
  var archiviatiP = new Set(toArchiveP.map(function(d) { return d.id; }));
  S.a = S.a.filter(function(inv) { return !archiviatiA.has(inv.id); });
  S.p = S.p.filter(function(inv) { return !archiviatiP.has(inv.id); });
  var toArchiveMov = S.movimenti.filter(function(m) { return movResiduo(m) === 0 && m.data <= cutoff; });
  S.archive.movimenti.push.apply(S.archive.movimenti, toArchiveMov.map(function(m) { return Object.assign({}, m, { _archivedOn: new Date().toISOString() }); }));
  var archiviatiM = new Set(toArchiveMov.map(function(m) { return m.id; }));
  S.movimenti = S.movimenti.filter(function(m) { return !archiviatiM.has(m.id); });
  save();
  render('a'); render('p'); renderMov(); renderArchiveDocs('a'); renderArchiveDocs('p'); renderArchiveMovs();
  closeModal('m-rollover');
  toast('✅ Archiviati: ' + (toArchiveA.length+toArchiveP.length) + ' fatture, ' + toArchiveMov.length + ' movimenti', 'success');
}

// ======================== XML IMPORT ========================
function qs2(el, name) { return Array.from(el.querySelectorAll('*')).find(function(e) { return e.localName === name; }) || null; }
function qsa2(el, name) { return Array.from(el.querySelectorAll('*')).filter(function(e) { return e.localName === name; }); }
function qt2(el, name) { var e = qs2(el, name); return e ? e.textContent.trim() : ''; }
function getRS(section) {
  if (!section) return '';
  var d = qt2(section, 'Denominazione');
  if (d) return d;
  return [qt2(section, 'Nome'), qt2(section, 'Cognome')].filter(Boolean).join(' ');
}
// Mapping codici TipoDocumento FatturaPA -> tipo interno.
// TD02/TD03 = Acconto su fattura/parcella -> 'acconto'.
// TD04 = Nota di Credito -> 'nota_credito' (unico tipo con segno invertito).
// TD05 = Nota di Debito: aumenta l'importo dovuto come una fattura normale, NON è un acconto -> 'fattura'.
// TD06 = Parcella, TD24/TD25 = Fatture differite: si comportano come fatture normali -> 'fattura'.
// Codici non mappati (reverse charge, autofatture, ecc.) ricadono su 'fattura' via il fallback a valle.
var TIPO_DOC_MAP = { TD01: 'fattura', TD02: 'acconto', TD03: 'acconto', TD04: 'nota_credito', TD05: 'fattura', TD06: 'fattura', TD24: 'fattura', TD25: 'fattura' };
function parseXML(str, type, fname) {
  var doc = new DOMParser().parseFromString(str, 'application/xml');
  // v2.22: DOMParser non lancia eccezioni su XML malformato, restituisce un documento <parsererror>:
  // senza questo controllo diventava una "fattura" da 0 € con il nome del file come ragione sociale.
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML malformato');
  if (!qs2(doc, 'FatturaElettronicaBody')) throw new Error('non è una FatturaPA');
  var cedente = qs2(doc, 'CedentePrestatore');
  var cession = qs2(doc, 'CessionarioCommittente');
  var ragSoc = type === 'a' ? getRS(cession) : getRS(cedente);
  var datiGen = qs2(doc, 'DatiGeneraliDocumento');
  var numero = qt2(datiGen || doc, 'Numero');
  var dataf = qt2(datiGen || doc, 'Data');
  var scadXML = qt2(doc, 'DataScadenzaPagamento') || '';
  var tipoDocXML = qt2(datiGen || doc, 'TipoDocumento') || 'TD01';
  var tipoInterno = TIPO_DOC_MAP[tipoDocXML] || 'fattura';
  var isCredito = tipoInterno === 'nota_credito';
  var riep = qsa2(doc, 'DatiRiepilogo');
  var imponibile = 0, totiva = 0;
  var righeIva = [];
  var aliqSet = new Set();
  var ivaSplit = 0;
  riep.forEach(function(r) {
    var imp = round2(parseFloat(qt2(r, 'ImponibileImporto')) || 0);
    var iva = round2(parseFloat(qt2(r, 'Imposta')) || 0);
    var aliqV = parseFloat(qt2(r, 'AliquotaIVA')) || 0;
    var esig = (qt2(r, 'EsigibilitaIVA') || '').toUpperCase();
    if (esig === 'S') ivaSplit = round2(ivaSplit + iva); // v2.23: split payment
    righeIva.push(esig ? { aliq: aliqV, imp: imp, iva: iva, esig: esig } : { aliq: aliqV, imp: imp, iva: iva });
    imponibile += imp; totiva += iva;
    if (aliqV > 0) aliqSet.add(aliqV + '%');
  });
  if (!imponibile) {
    qsa2(doc, 'DettaglioLinee').forEach(function(d) {
      var imp = round2(parseFloat(qt2(d, 'PrezzoTotale')) || 0);
      imponibile += imp;
      if (!righeIva.length) righeIva.push({ aliq: 0, imp: imp, iva: 0 });
      else righeIva[0].imp = round2(righeIva[0].imp + imp);
    });
  }
  var sign = isCredito ? -1 : 1;
  var aliqDisplay = aliqSet.size ? Array.from(aliqSet).join(', ') : '0%';
  var totDoc = round2((parseFloat(qt2(doc, 'ImportoTotaleDocumento')) || (imponibile + totiva)) * sign);
  // v2.23: ritenute (DatiRitenuta può ripetersi: ritenuta d'acconto, contributi INPS, ENASARCO...)
  var ritenuta = 0;
  qsa2(datiGen || doc, 'DatiRitenuta').forEach(function(r) { ritenuta = round2(ritenuta + Math.abs(parseFloat(qt2(r, 'ImportoRitenuta')) || 0)); });
  var modXML = qt2(doc, 'ModalitaPagamento') || '';
  var modMap = { MP01: 'contanti', MP02: 'assegno', MP04: 'carta', MP05: 'bonifico', MP09: 'riba', MP12: 'rid', MP08: 'rid' };
  return {
    id: uid(), type: type,
    rs: ragSoc || fname.replace('.xml', ''),
    tipo: tipoInterno,
    num: numero || '—',
    data: dataf || '',
    imp: round2(imponibile * sign),
    aliq: aliqDisplay,
    totiva: round2(totiva * sign),
    tot: totDoc,
    righeIva: righeIva.length ? righeIva.map(function(r) { var o = { aliq: r.aliq, imp: r.imp * sign, iva: r.iva * sign }; if (r.esig) o.esig = r.esig; return o; }) : [{ aliq: 0, imp: round2(imponibile * sign), iva: round2(totiva * sign) }],
    ritenuta: ritenuta,
    ivaSplit: ivaSplit,
    modpag: modMap[modXML] || '',
    scad: scadXML, note: '',
    hasPdf: false, pdfName: null,
    pagamenti: [], pagato: 0,
    created: new Date().toISOString(),
    src: fname,
    valuta: 'EUR'
  };
}
async function handleFilesArr(files, type) {
  var added = 0, dups = 0, skipped = 0, errs = 0;
  var dupNames = [];
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (!f.name.toLowerCase().endsWith('.xml')) { skipped++; continue; }
    try {
      var text = await f.text();
      var inv = parseXML(text, type, f.name);
      // v2.22: il duplicato considera anche l'ANNO: i fornitori ripartono dal n. 1 ogni anno, quindi
      // stessa ragione sociale + stesso numero in anni diversi sono fatture diverse. Controlla anche
      // l'archivio, per non reimportare fatture già archiviate.
      var annoInv = (inv.data || '').slice(0, 4);
      var candidatiDup = S[type].concat(((S.archive && S.archive.docs) || []).filter(function(d) { return d._originalType === type; }));
      var isDup = candidatiDup.some(function(i) { return i.rs.toLowerCase() === inv.rs.toLowerCase() && i.num === inv.num && (i.data || '').slice(0, 4) === annoInv; });
      if (isDup) { dups++; dupNames.push(inv.rs + ' — ' + inv.num); }
      else { S[type].push(inv); addSupplier(inv.rs); added++; }
    } catch (e) { errs++; }
  }
  save(); render(type);
  if (added) toast('✅ ' + added + ' fattura/e importata/e', 'success');
  if (dups) toast('⚠️ ' + dups + ' duplicato/i saltato/i: ' + dupNames.slice(0, 3).join(', ') + (dups > 3 ? '…' : ''), 'warn');
  if (skipped) toast('ℹ️ ' + skipped + ' file ignorato/i (non .xml)', 'info');
  if (errs) toast('❌ ' + errs + ' file XML non valido/i o illeggibili', 'error');
}
async function handleXML(ev, type) { await handleFilesArr(Array.from(ev.target.files), type); ev.target.value = ''; }
function triggerXML(type) {
  var el = document.getElementById('xml-' + type);
  if (el) {
    el.click();
  } else {
    toast('Errore: elemento input non trovato', 'error');
  }
}
function toggleZone(type) { var z = document.getElementById('zone-' + type); if (z) z.classList.toggle('show'); }
function onDragOver(ev, type) { ev.preventDefault(); var z = document.getElementById('zone-' + type); if (z) z.classList.add('over', 'show'); }
function onDragLeave(ev, type) { var z = document.getElementById('zone-' + type); if (z) z.classList.remove('over'); }
async function onDrop(ev, type) {
  ev.preventDefault();
  var z = document.getElementById('zone-' + type);
  if (z) z.classList.remove('over', 'show');
  var files = Array.from(ev.dataTransfer.files);
  await handleFilesArr(files, type);
}

// ======================== TABELLE FATTURE ========================
function buildTH(type) {
  var col = sortS[type].col, dir = sortS[type].dir;
  var th = document.getElementById('th-' + type);
  if (!th) return;
  th.innerHTML = COLS.map(function(c) {
    var arrow = '';
    if (c.sort) {
      arrow = '<span class="sort-arrow">' + (c.k === col ? (dir === 'asc' ? '▲' : '▼') : '↕') + '</span>';
    }
    return '<th class="' + (c.k === col ? 'sorted' : '') + '" style="' + (c.w ? 'width:' + c.w : '') + '" onclick="' + (c.sort ? 'doSort(\'' + type + '\',\'' + c.k + '\')' : '') + '" >' + c.l + arrow + '</th>';
  }).join('');
}
function naturalCmp(a, b) {
  var re = /(\d+)|(\D+)/g;
  var pa = String(a).match(re) || [], pb = String(b).match(re) || [];
  for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
    var ca = pa[i] || '', cb = pb[i] || '';
    var na = parseInt(ca, 10), nb = parseInt(cb, 10);
    if (!isNaN(na) && !isNaN(nb)) { if (na !== nb) return na - nb; }
    else { if (ca < cb) return -1; if (ca > cb) return 1; }
  }
  return 0;
}
// Il filtro periodo accetta sia un mese ('AAAA-MM') sia un intero anno ('y:AAAA').
function matchPeriod(dataStr, period) {
  if (period === 'all' || !dataStr) return true;
  if (period.indexOf('y:') === 0) return dataStr.slice(0, 4) === period.slice(2);
  return dataStr.slice(0, 7) === period;
}
function getSorted(type) {
  var q = (document.getElementById('srch-' + type) || { value: '' }).value.toLowerCase();
  var da = (document.getElementById('fda-' + type) ? document.getElementById('fda-' + type).value : '');
  var db = (document.getElementById('fdb-' + type) ? document.getElementById('fdb-' + type).value : '');
  var fst = (document.getElementById('fst-' + type) ? document.getElementById('fst-' + type).value : '');
  var fmod = (document.getElementById('fmod-' + type) ? document.getElementById('fmod-' + type).value : '');
  var period = (document.getElementById('period-' + type) ? document.getElementById('period-' + type).value : 'all');
  var data = S[type].filter(function(i) {
    if (q && !i.rs.toLowerCase().includes(q) && !String(i.num || '').toLowerCase().includes(q) && !(i.note && i.note.toLowerCase().includes(q))) return false;
    if (da && (i.data || '') < da) return false;
    if (db && (i.data || '') > db) return false;
    if (fst && statusOf(i) !== fst) return false;
    if (fmod) { var matchPag = (i.pagamenti || []).some(function(p) { return p.mod === fmod; }); if (i.modpag !== fmod && !matchPag) return false; }
    if (period !== 'all' && !matchPeriod(i.data, period)) return false;
    return true;
  });
  var col = sortS[type].col, dir = sortS[type].dir;
  var sign = dir === 'asc' ? 1 : -1;
  data.sort(function(a, b) {
    var cmp = 0;
    if (col === 'num') { cmp = naturalCmp(a.num, b.num) * sign; }
    else if (['imp', 'totiva', 'tot', 'pagato'].includes(col)) { cmp = ((parseFloat(a[col]) || 0) - (parseFloat(b[col]) || 0)) * sign; }
    else if (col === 'res') { cmp = (residuo(a) - residuo(b)) * sign; }
    else if (col === 'valuta') { cmp = (a.valuta || 'EUR').localeCompare(b.valuta || 'EUR') * sign; }
    else { var av = String(a[col] || '').toLowerCase(), bv = String(b[col] || '').toLowerCase(); cmp = (av < bv ? -1 : av > bv ? 1 : 0) * sign; }
    if (cmp === 0) cmp = (b.data || '').localeCompare(a.data || '');
    if (cmp === 0) cmp = naturalCmp(a.num, b.num);
    return cmp;
  });
  var tot = S[type].length;
  var countEl = document.getElementById('fcount-' + type);
  if (countEl) countEl.textContent = tot === 0 ? '' : (data.length < tot ? data.length + ' di ' + tot + ' fatture' : tot + ' fattura/e');
  return data;
}
function clearFilter(type) {
  var srch = document.getElementById('srch-' + type); if (srch) srch.value = '';
  var da = document.getElementById('fda-' + type); if (da) da.value = '';
  var db = document.getElementById('fdb-' + type); if (db) db.value = '';
  var fst = document.getElementById('fst-' + type); if (fst) fst.value = '';
  var fmod = document.getElementById('fmod-' + type); if (fmod) fmod.value = '';
  var period = document.getElementById('period-' + type); if (period) period.value = 'all';
  render(type);
}
function render(type) {
  buildTH(type);
  var data = getSorted(type);
  var tb = document.getElementById('tb-' + type);
  var tf = document.getElementById('tf-' + type);
  if (!tb) return;
  if (!data.length) {
    tb.innerHTML = '<tr><td colspan="' + COLS.length + '" class="empty-state"><span class="ei">📄</span>Nessuna fattura. Carica file XML o aggiungi manualmente.</td></tr>';
    if (tf) tf.innerHTML = '';
    renderSummary();
    refreshScadenzeIfVisible();
    return;
  }
  tb.innerHTML = data.map(function(i) { return row(i, type); }).join('');
  if (tf) renderTotals(type, data);
  renderSummary();
  updatePeriodSelectors();
  refreshScadenzeIfVisible();
}
function renderTotals(type, data) {
  var tf = document.getElementById('tf-' + type);
  if (!tf || !data.length) { if (tf) tf.innerHTML = ''; return; }
  var ti = round2(data.reduce(function(s, i) { return s + (i.imp || 0); }, 0));
  var tv = round2(data.reduce(function(s, i) { return s + (i.totiva || 0); }, 0));
  var tt = round2(data.reduce(function(s, i) { return s + (i.tot || 0); }, 0));
  var tr = round2(data.reduce(function(s, i) { return s + residuo(i); }, 0));
  var modTotals = {};
  data.forEach(function(i) {
    (i.pagamenti || []).forEach(function(p) { var k = p.mod || 'altro'; modTotals[k] = (modTotals[k] || 0) + p.importo; });
  });
  var totPagato = round2(Object.values(modTotals).reduce(function(s, v) { return s + v; }, 0));
  var modLines = Object.entries(modTotals).sort(function(a, b) { return b[1] - a[1]; }).map(function(entry) {
    return '<div class="tf-pay-line"><span class="tfl-mod">' + modLabelHtml(entry[0]) + '</span><span class="tfl-amt">€ ' + fmt(round2(entry[1])) + '</span></div>';
  }).join('');
  var pagCell = modLines ? '<div class="tf-pay-grp">' + modLines + '</div><div class="tf-pay-line" style="border-top:1px solid rgba(255,255,255,.3);margin-top:.25rem;padding-top:.2rem"><span style="font-weight:700">Totale</span><span class="tfl-amt">€ ' + fmt(totPagato) + '</span></div>' : '<span style="opacity:.5;font-size:.8rem">Nessun pagamento</span>';
  var cells = COLS.map(function(c) {
    switch (c.k) {
      case 'rs': return '<td><span class="tf-lbl">Fatture</span><span class="tf-val tf-n">' + data.length + '</span></td>';
      case 'imp': return '<td class="num"><span class="tf-lbl">Imponibile</span><span class="tf-val">€ ' + fmt(ti) + '</span></td>';
      case 'totiva': return '<td class="num"><span class="tf-lbl">Tot. IVA</span><span class="tf-val">€ ' + fmt(tv) + '</span></td>';
      case 'tot': return '<td class="num"><span class="tf-lbl">Totale Doc.</span><span class="tf-val">€ ' + fmt(tt) + '</span></td>';
      case '_pagamenti': return '<td><span class="tf-lbl">Pagato per metodo</span>' + pagCell + '</td>';
      case 'res': return '<td class="num"><span class="tf-lbl">Residuo</span><span class="tf-val" style="color:#fde68a">€ ' + fmt(tr) + '</span></td>';
      default: return '<td></td>';
    }
  }).join('');
  tf.innerHTML = '<tr>' + cells + '</tr>';
}
// ======================== RITENUTA D'ACCONTO E SPLIT PAYMENT (v2.23) ========================
// Importi sempre positivi, indipendenti dal segno della nota di credito.
// - ritenuta: trattenuta dal cliente e versata da lui all'Erario (F24) → non arriva mai in banca
// - ivaSplit: IVA che il cliente PA versa direttamente all'Erario (EsigibilitaIVA = S) → idem
function ritenutaDoc(i) { return Math.abs(parseFloat(i && i.ritenuta) || 0); }
function ivaSplitDoc(i) { return Math.abs(parseFloat(i && i.ivaSplit) || 0); }
// Importo che si incassa/paga davvero: è la base di residuo, stato e riconciliazione.
function nettoDaPagare(i) {
  var base = i.tipo === 'nota_credito' ? Math.abs(i.tot || 0) : Math.max(0, i.tot || 0);
  return Math.max(0, round2(base - ritenutaDoc(i) - ivaSplitDoc(i)));
}
function badgeRitSplit(i) {
  var out = '';
  if (ritenutaDoc(i) > 0) out += ' <span class="badge badge-rit" title="Ritenuta d\'acconto € ' + fmt(ritenutaDoc(i)) + '">RIT</span>';
  if (ivaSplitDoc(i) > 0) out += ' <span class="badge badge-split" title="Split payment: IVA € ' + fmt(ivaSplitDoc(i)) + ' versata dal cliente">SPLIT</span>';
  return out;
}
// v2.22: confronto sul valore assoluto — per le note di credito (tot negativo) "p >= t" era sempre
// vero, quindi una nota usata solo in parte risultava verde.
// v2.23: il riferimento è il netto da pagare (totale − ritenuta − IVA split).
function statusOf(i) { var p = i.pagato || 0, t = nettoDaPagare(i); if (p <= 0) return t > 0 ? 'r' : 'g'; if (p >= t - 0.005) return 'g'; return 'y'; }
function residuo(i) {
  return Math.max(0, round2(nettoDaPagare(i) - (i.pagato || 0)));
}
function tipoBadge(tipo) {
  var map = { fattura: '<span class="badge badge-f">FATTURA</span>', proforma: '<span class="badge badge-p">PROFORMA</span>', nota_credito: '<span class="badge badge-nc">N.CREDITO</span>', acconto: '<span class="badge badge-a">ACCONTO</span>' };
  return map[tipo] || '<span class="badge badge-f">FATTURA</span>';
}

// ======================== DASHBOARD SCADENZE ========================
// Giorni tra oggi e la data di scadenza (negativo = già scaduta, null = senza scadenza impostata).
function ggScadenza(scad) {
  if (!scad) return null;
  var d = new Date(scad + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  var now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d - now) / (1000 * 3600 * 24));
}
function scadenzeBucket(gg) {
  if (gg === null) return 'oltre';
  if (gg < 0) return 'scadute';
  if (gg <= 7) return 'entro7';
  if (gg <= 30) return 'entro30';
  return 'oltre';
}
function buildScadenzeList() {
  var out = [];
  ['a', 'p'].forEach(function(type) {
    S[type].forEach(function(inv) {
      var res = residuo(inv);
      if (res <= 0) return;
      var gg = ggScadenza(inv.scad);
      out.push({ inv: inv, type: type, residuo: res, gg: gg, bucket: scadenzeBucket(gg) });
    });
  });
  return out;
}
function renderScadenze() {
  var tb = document.getElementById('tb-scad');
  if (!tb) return; // tab non presente in questa versione dell'HTML
  var q = (document.getElementById('srch-scad') || { value: '' }).value.toLowerCase();
  var ftipo = (document.getElementById('ftipo-scad') || { value: '' }).value;
  var fstato = (document.getElementById('fstato-scad') || { value: '' }).value;

  var all = buildScadenzeList();

  var stats = { scadute: { n: 0, tot: 0 }, entro7: { n: 0, tot: 0 }, entro30: { n: 0, tot: 0 } };
  all.forEach(function(r) {
    if (stats[r.bucket]) { stats[r.bucket].n++; stats[r.bucket].tot += r.residuo; }
  });
  var statsEl = document.getElementById('scad-stats');
  if (statsEl) {
    statsEl.innerHTML =
      '<div class="scad-stat-card ssc-scadute"><div class="ssc-lbl">🔴 Scadute</div><div class="ssc-n">' + stats.scadute.n + '</div><div class="ssc-amt">€ ' + fmt(stats.scadute.tot) + '</div></div>' +
      '<div class="scad-stat-card ssc-entro7"><div class="ssc-lbl">🟠 Entro 7 giorni</div><div class="ssc-n">' + stats.entro7.n + '</div><div class="ssc-amt">€ ' + fmt(stats.entro7.tot) + '</div></div>' +
      '<div class="scad-stat-card ssc-entro30"><div class="ssc-lbl">🟡 Entro 30 giorni</div><div class="ssc-n">' + stats.entro30.n + '</div><div class="ssc-amt">€ ' + fmt(stats.entro30.tot) + '</div></div>';
  }

  var filtered = all.filter(function(r) {
    if (ftipo && r.type !== ftipo) return false;
    if (fstato && r.bucket !== fstato) return false;
    if (q && !r.inv.rs.toLowerCase().includes(q) && !String(r.inv.num || '').toLowerCase().includes(q)) return false;
    return true;
  });
  filtered.sort(function(a, b) {
    if (a.gg === null && b.gg === null) return 0;
    if (a.gg === null) return 1;
    if (b.gg === null) return -1;
    return a.gg - b.gg;
  });

  var fcount = document.getElementById('fcount-scad');
  if (fcount) fcount.textContent = filtered.length + ' / ' + all.length;

  if (!filtered.length) {
    tb.innerHTML = '<tr><td colspan="8" class="empty-state"><span class="ei">✅</span>Nessuna scadenza da mostrare con questi filtri.</td></tr>';
    return;
  }
  tb.innerHTML = filtered.map(function(r) {
    var inv = r.inv;
    var dotClass = r.bucket === 'scadute' ? 'dot-r' : r.bucket === 'entro7' ? 'dot-y' : r.bucket === 'entro30' ? 'dot-b' : 'dot-g';
    var tipoLbl = r.type === 'a' ? '<span class="badge badge-a" style="background:#dcfce7;color:#14532d">DA INCASSARE</span>' : '<span class="badge badge-p">DA PAGARE</span>';
    var statoTxt;
    if (r.gg === null) statoTxt = '<span style="color:#a8a29e">senza scadenza</span>';
    else if (r.gg < 0) statoTxt = '<span style="color:#dc2626;font-weight:700">scaduta da ' + Math.abs(r.gg) + ' gg</span>';
    else if (r.gg === 0) statoTxt = '<span style="color:#ea580c;font-weight:700">scade oggi</span>';
    else statoTxt = '<span style="color:' + (r.gg <= 7 ? '#ea580c' : r.gg <= 30 ? '#b45309' : '#57534e') + '">tra ' + r.gg + ' gg</span>';
    var scadFmt = inv.scad ? inv.scad.split('-').reverse().join('/') : '—';
    return '<tr>' +
      '<td><span class="dot ' + dotClass + '"></span></td>' +
      '<td>' + tipoLbl + '</td>' +
      '<td>' + esc(inv.rs) + '</td>' +
      '<td>' + esc(inv.num) + '</td>' +
      '<td>' + scadFmt + '</td>' +
      '<td>' + statoTxt + '</td>' +
      '<td class="num">€ ' + fmt(r.residuo) + '</td>' +
      '<td><button class="btn btn-neutral btn-sm" onclick="openPayments(\'' + inv.id + '\',\'' + r.type + '\')">💳 Pagamenti</button></td>' +
      '</tr>';
  }).join('');
}
// Se il tab Scadenze è attivo, lo tiene aggiornato ogni volta che una lista fatture viene ridisegnata
// (es. dopo una riconciliazione, un pagamento manuale, un'archiviazione).
function refreshScadenzeIfVisible() {
  var pane = document.getElementById('tab-scadenze');
  if (pane && pane.classList.contains('active') && typeof renderScadenze === 'function') renderScadenze();
}

function pagamentiCell(i) {
  var pags = i.pagamenti || [];
  if (!pags.length) return '<span style="color:#a8a29e;font-size:.78rem">—</span>';
  var entries = pags.map(function(p) {
    var reconBadge = p._movId ? '<span style="font-size:.7rem;margin-left:.2rem" title="Riconciliato">🏦</span>' : '<span style="font-size:.7rem;margin-left:.2rem;opacity:0.5" title="Non riconciliato">⚠️</span>';
    return '<div class="pay-entry"><span class="pe-date">' + (p.data ? p.data.split('-').reverse().join('/') : '—') + '</span><span class="pe-mod">' + modLabelHtml(p.mod) + '</span><span class="pe-amt">€ ' + fmt(p.importo) + ' ' + reconBadge + '</span></div>';
  }).join('');
  var totPaid = round2(pags.reduce(function(s, p) { return s + p.importo; }, 0));
  var showTot = pags.length > 1 ? '<div class="pe-tot"><span>Totale pagato</span><span>€ ' + fmt(totPaid) + '</span></div>' : '';
  return '<div class="pay-cell">' + entries + showTot + '</div>';
}
function row(i, type) {
  var st = statusOf(i);
  var res = residuo(i);
  var isPaidNotReconciled = (st === 'g') && (!i.pagamenti || i.pagamenti.every(function(p) { return !p._movId; }));
  var dotClass = 'dot-' + st;
  if (isPaidNotReconciled) dotClass += ' dot-warn';
  var pdfIcon = i.hasPdf ? '<button class="ico" style="color:#2563eb;font-size:1rem" onclick="openPDF(\'' + i.id + '\',\'' + type + '\')">📄</button>' : '—';
  return '<tr class="' + (type === 'a' ? 'act' : 'pas') + '">' +
    '<td><span class="dot ' + dotClass + '" title="' + (st === 'r' ? 'Da pagare' : st === 'y' ? 'Parziale' : 'Pagata') + '"></span></td>' +
    '<td>' + tipoBadge(i.tipo) + badgeRitSplit(i) + '</td>' +
    '<td><strong>' + esc(i.rs) + '</strong></td>' +
    '<td>' + esc(i.num) + '</td>' +
    '<td>' + (i.data ? i.data.split('-').reverse().join('/') : '—') + '</td>' +
    '<td>' + (i.scad ? i.scad.split('-').reverse().join('/') : '—') + '</td>' +
    '<td class="num">€ ' + fmt(i.imp) + '</td>' +
    '<td class="num">' + (i.aliq || '—') + '</td>' +
    '<td class="num">€ ' + fmt(i.totiva) + '</td>' +
    '<td class="num"><strong>€ ' + fmt(i.tot) + '</strong></td>' +
    '<td class="num">' + (i.valuta || 'EUR') + '</td>' +
    '<td>' + pagamentiCell(i) + '</td>' +
    '<td class="num">€ ' + fmt(res) + '</td>' +
    '<td>' + pdfIcon + '</td>' +
    '<td><div style="display:flex;gap:.2rem"><button class="ico" style="color:#2563eb" onclick="editInv(\'' + i.id + '\',\'' + type + '\')">✏️</button><button class="ico" style="color:#dc2626" onclick="delInv(\'' + i.id + '\',\'' + type + '\')">🗑️</button><button class="ico" style="color:#16a34a" onclick="openPayments(\'' + i.id + '\',\'' + type + '\')">💳</button></div></td>' +
    '</tr>';
}
function doSort(type, col) {
  if (sortS[type].col === col) sortS[type].dir = sortS[type].dir === 'asc' ? 'desc' : 'asc';
  else { sortS[type].col = col; sortS[type].dir = 'asc'; }
  render(type);
  savePreferences();
}
function addSupplier(rs) { if (!S.suppliers.includes(rs)) S.suppliers.push(rs); }
function openAdd(type) {
  curType = type;
  editId = null;
  document.getElementById('m-inv-title').textContent = type === 'a' ? '➕ Nuova Fattura Attiva' : '➕ Nuova Fattura Passiva';
  document.getElementById('m-inv-sub').textContent = type === 'a' ? 'Cliente' : 'Fornitore';
  document.getElementById('f-rs').value = '';
  document.getElementById('f-tipo').value = 'fattura';
  document.getElementById('f-num').value = '';
  document.getElementById('f-data').value = today();
  document.getElementById('f-scad').value = '';
  document.getElementById('f-note').value = '';
  if (document.getElementById('f-ritenuta')) document.getElementById('f-ritenuta').value = '0';
  if (document.getElementById('f-split')) document.getElementById('f-split').checked = false;
  document.getElementById('f-modpag').innerHTML = modOptions();
  document.getElementById('f-valuta').value = 'EUR';
  document.getElementById('f-pdf').value = '';
  document.getElementById('f-remove-pdf').style.display = 'none';
  document.getElementById('f-remove-pdf').setAttribute('data-remove', '0');
  var ivaContainer = document.getElementById('iva-lines');
  if (ivaContainer) ivaContainer.innerHTML = '';
  addIvaLine();
  openModal('m-inv');
}

// ======================== IMPORTA FATTURA DA PDF (fornitori esteri senza XML) ========================
// Estrazione euristica "best effort" da testo PDF non strutturato: nessuna garanzia di
// correttezza sui singoli campi. Serve solo a pre-compilare il form di inserimento manuale
// (ragione sociale, numero, data, importo con aliquota 0% — tipico per fornitori esteri esenti);
// l'utente controlla e corregge sempre prima di salvare, esattamente come un inserimento manuale.
var _pdfJsLoaded = false;
function loadPdfJs() {
  if (_pdfJsLoaded && window.pdfjsLib) return Promise.resolve();
  return new Promise(function(resolve, reject) {
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = function() {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      _pdfJsLoaded = true;
      resolve();
    };
    script.onerror = function() { reject(new Error('impossibile caricare la libreria di lettura PDF (serve internet la prima volta)')); };
    document.head.appendChild(script);
  });
}
function triggerPdfImport() { document.getElementById('pdf-import-input').click(); }
function pad2(n) { return String(n).padStart(2, '0'); }
// Tollerante sia al formato europeo (1.234,56) sia a quello anglosassone (1,234.56): l'ultimo
// separatore incontrato nella stringa è trattato come decimale, l'altro come migliaia.
function parseFlexibleAmount(str) {
  str = String(str).replace(/[^\d.,]/g, '');
  var lastComma = str.lastIndexOf(','), lastDot = str.lastIndexOf('.');
  var decSep = lastComma > lastDot ? ',' : '.';
  var thouSep = decSep === ',' ? '.' : ',';
  str = str.split(thouSep).join('').replace(decSep, '.');
  return parseFloat(str) || 0;
}
function extractInvoiceFieldsFromText(text) {
  var result = { rs: '', num: '', data: '', importo: 0 };
  var lines = text.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
  if (lines.length) result.rs = lines[0].slice(0, 80); // euristica debole: spesso l'intestazione del fornitore

  var numPattern = /(?:invoice\s*(?:no|number|#)|rechnung(?:s)?(?:nr|nummer)|facture\s*n[°o]|n[uú]mero\s*(?:de\s*)?factura|numero\s*fattura|fattura\s*n[°o.]?)\s*[:.\-]?\s*([A-Za-z0-9\-\/]+)/i;
  var mNum = text.match(numPattern);
  if (mNum) result.num = mNum[1];

  var datePattern = /(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{4})/;
  var mDate = text.match(datePattern);
  if (mDate) {
    if (mDate[1]) result.data = mDate[1] + '-' + pad2(mDate[2]) + '-' + pad2(mDate[3]);
    else result.data = mDate[6] + '-' + pad2(mDate[5]) + '-' + pad2(mDate[4]); // assume GG/MM/AAAA
  }

  var totalPattern = /(?:grand\s*total|total\s*amount|amount\s*due|total|totale|gesamtbetrag|montant\s*total)\s*[:\s]*[€$£]?\s*([\d.,]+)/gi;
  var match, lastAmount = null;
  while ((match = totalPattern.exec(text)) !== null) lastAmount = match[1];
  if (lastAmount) result.importo = parseFlexibleAmount(lastAmount);
  return result;
}
async function handlePdfImport(evt) {
  var file = evt.target.files[0];
  if (!file) return;
  evt.target.value = '';
  toast('⏳ Lettura del PDF in corso...', 'info');
  try {
    await loadPdfJs();
    var arrayBuffer = await file.arrayBuffer();
    var pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    var text = '';
    var maxPages = Math.min(pdf.numPages, 2);
    for (var p = 1; p <= maxPages; p++) {
      var page = await pdf.getPage(p);
      var content = await page.getTextContent();
      text += content.items.map(function(it) { return it.str; }).join(' ') + '\n';
    }
    var extracted = extractInvoiceFieldsFromText(text);
    openAdd('p');
    if (extracted.rs) document.getElementById('f-rs').value = extracted.rs;
    if (extracted.num) document.getElementById('f-num').value = extracted.num;
    if (extracted.data) document.getElementById('f-data').value = extracted.data;
    document.getElementById('f-note').value = 'Importato da PDF (fornitore estero) — verificare tutti i dati prima di salvare.';
    var ivaContainer = document.getElementById('iva-lines');
    if (ivaContainer) ivaContainer.innerHTML = '';
    addIvaLine(0, extracted.importo || 0, 0);
    if (typeof updateIvaTotals === 'function') updateIvaTotals();
    // Allega subito il PDF selezionato, come se l'avessi scelto tu dal campo file del form.
    var dt = new DataTransfer();
    dt.items.add(file);
    document.getElementById('f-pdf').files = dt.files;
    toast('📎 Dati estratti dal PDF — controlla ragione sociale, numero, data e importo prima di salvare', 'info');
  } catch (e) {
    console.error('handlePdfImport:', e);
    toast('❌ Lettura PDF fallita: ' + e.message + ' — puoi comunque inserire la fattura a mano con "➕ Aggiungi"', 'error');
  }
}
function editInv(id, type) {
  curType = type;
  editId = id;
  var inv = S[type].find(function(i) { return i.id === id; });
  if (!inv) return;
  document.getElementById('m-inv-title').textContent = type === 'a' ? '✏️ Modifica Fattura Attiva' : '✏️ Modifica Fattura Passiva';
  document.getElementById('f-rs').value = inv.rs;
  document.getElementById('f-tipo').value = inv.tipo;
  document.getElementById('f-num').value = inv.num;
  document.getElementById('f-data').value = inv.data || '';
  document.getElementById('f-scad').value = inv.scad || '';
  document.getElementById('f-note').value = inv.note || '';
  if (document.getElementById('f-ritenuta')) document.getElementById('f-ritenuta').value = ritenutaDoc(inv).toFixed(2);
  if (document.getElementById('f-split')) document.getElementById('f-split').checked = ivaSplitDoc(inv) > 0;
  document.getElementById('f-modpag').innerHTML = modOptions(inv.modpag);
  document.getElementById('f-valuta').value = inv.valuta || 'EUR';
  var ivaContainer = document.getElementById('iva-lines');
  ivaContainer.innerHTML = '';
  if (inv.righeIva && inv.righeIva.length) {
    inv.righeIva.forEach(function(r) { addIvaLine(r.aliq, r.imp, r.iva); });
  } else {
    addIvaLine();
  }
  document.getElementById('f-pdf').value = '';
  var removeBtn = document.getElementById('f-remove-pdf');
  if (inv.hasPdf) {
    removeBtn.style.display = 'inline-flex';
    removeBtn.setAttribute('data-remove', '1');
  } else {
    removeBtn.style.display = 'none';
    removeBtn.setAttribute('data-remove', '0');
  }
  openModal('m-inv');
}
async function saveInv() {
  var rs = document.getElementById('f-rs').value.trim();
  if (!rs) { toast('Inserisci la ragione sociale', 'error'); return; }
  var tipo = document.getElementById('f-tipo').value;
  var num = document.getElementById('f-num').value.trim();
  if (!num) { toast('Inserisci il numero fattura', 'error'); return; }
  var data = document.getElementById('f-data').value;
  if (!data) { toast('Inserisci la data', 'error'); return; }
  var scad = document.getElementById('f-scad').value;
  var note = document.getElementById('f-note').value;
  var modpag = document.getElementById('f-modpag').value;
  var valuta = document.getElementById('f-valuta').value;
  var righeIva = [];
  var imponibile = 0, totiva = 0;
  // Le note di credito si registrano internamente con segno negativo (coerente con l'import XML),
  // così i totali e i report le sottraggono invece di sommarle. L'utente inserisce sempre importi
  // positivi nel form: qui prendiamo il valore assoluto e riapplichiamo il segno corretto.
  var sign = tipo === 'nota_credito' ? -1 : 1;
  document.querySelectorAll('#iva-lines .iva-line').forEach(function(line) {
    var aliq = parseFloat(line.querySelector('.iva-aliq').value) || 0;
    var imp = Math.abs(parseFloat(line.querySelector('.iva-imp').value) || 0) * sign;
    var iva = round2(imp * aliq / 100);
    righeIva.push({ aliq: aliq, imp: imp, iva: iva });
    imponibile += imp;
    totiva += iva;
  });
  if (!righeIva.length) { toast('Aggiungi almeno una riga IVA', 'error'); return; }
  var tot = round2(imponibile + totiva);
  var oldInvEdit = editId ? S[curType].find(function(i) { return i.id === editId; }) : null;
  // v2.23: ritenuta e split payment
  var ritenuta = round2(Math.abs(parseFloat((document.getElementById('f-ritenuta') || { value: 0 }).value) || 0));
  var splitChk = !!(document.getElementById('f-split') && document.getElementById('f-split').checked);
  var ivaSplit = 0;
  if (splitChk) {
    // Se l'IVA non è cambiata si conserva l'IVA split letta dall'XML (può riguardare solo alcune righe)
    ivaSplit = (oldInvEdit && ivaSplitDoc(oldInvEdit) > 0 && Math.abs(round2(Math.abs(oldInvEdit.totiva || 0) - Math.abs(totiva))) < 0.005)
      ? ivaSplitDoc(oldInvEdit) : round2(Math.abs(totiva));
  }
  if (ritenuta + ivaSplit > Math.abs(tot) + 0.005) { toast('⚠️ Ritenuta + IVA split superano il totale del documento', 'warn'); return; }
  var nettoNuovo = round2(Math.abs(tot) - ritenuta - ivaSplit);
  // v2.22: il netto da pagare non può scendere sotto quanto già pagato/compensato
  if (oldInvEdit && (oldInvEdit.pagato || 0) > nettoNuovo + 0.005) {
    toast('⚠️ Il netto da pagare (€ ' + fmt(nettoNuovo) + ') è inferiore al già pagato (€ ' + fmt(oldInvEdit.pagato) + '): elimina prima i pagamenti in eccesso', 'warn');
    return;
  }
  if (splitChk) righeIva.forEach(function(r) { if (r.iva) r.esig = 'S'; });
  else if (oldInvEdit && oldInvEdit.righeIva) {
    // conserva l'esigibilità letta dall'XML (I/D), tranne S che dipende dalla casella
    righeIva.forEach(function(r, idx) { var o = oldInvEdit.righeIva[idx]; if (o && o.esig && o.esig !== 'S') r.esig = o.esig; });
  }
  var invData = {
    id: editId || uid(),
    rs: rs, tipo: tipo, num: num, data: data, scad: scad, note: note, modpag: modpag, valuta: valuta,
    imp: round2(imponibile),
    totiva: round2(totiva),
    tot: tot,
    righeIva: righeIva,
    ritenuta: ritenuta,
    ivaSplit: ivaSplit,
    aliq: righeIva.map(function(r) { return r.aliq; }).join(', ') + '%',
    pagamenti: editId ? (S[curType].find(function(i) { return i.id === editId; }) || {}).pagamenti || [] : [],
    pagato: editId ? (S[curType].find(function(i) { return i.id === editId; }) || {}).pagato || 0 : 0,
    hasPdf: false, pdfName: null,
    created: editId ? (S[curType].find(function(i) { return i.id === editId; }) || {}).created : new Date().toISOString(),
    src: oldInvEdit ? (oldInvEdit.src || 'manual') : 'manual', // v2.22: non perde più l'origine XML
    type: curType
  };
  var pdfFile = document.getElementById('f-pdf').files[0];
  var removePdfFlag = document.getElementById('f-remove-pdf').getAttribute('data-remove') === '1';
  if (pdfFile) {
    var b64 = await toBase64(pdfFile);
    var pdfResult = await fsPdfPut(invData.id, b64);
    if (pdfResult.ok && pdfResult.location === 'dir') {
      invData.hasPdf = true;
      invData.pdfName = pdfFile.name;
    } else if (pdfResult.ok) {
      // Modalità senza cartella dati (IndexedDB): è il salvataggio normale, nessun avviso.
      invData.hasPdf = true;
      invData.pdfName = pdfFile.name;
    } else if (pdfResult.location === 'idb-fallback') {
      // v2.22: salvato, ma NON sulla chiavetta — resta solo su questo PC/browser. Prima questo caso
      // finiva nel ramo "impossibile salvare" con hasPdf=false, lasciando il PDF orfano in IndexedDB.
      invData.hasPdf = true;
      invData.pdfName = pdfFile.name;
      toast('⚠️ PDF salvato solo in locale su questo PC (non sulla chiavetta): ' + pdfResult.error, 'warn');
    } else {
      invData.hasPdf = false;
      invData.pdfName = null;
      toast('❌ Impossibile salvare il PDF allegato: ' + pdfResult.error, 'error');
    }
  } else if (removePdfFlag && editId) {
    await fsPdfDelete(editId);
    invData.hasPdf = false;
    invData.pdfName = null;
  } else if (editId) {
    var oldInv = S[curType].find(function(i) { return i.id === editId; });
    if (oldInv && oldInv.hasPdf) {
      invData.hasPdf = true;
      invData.pdfName = oldInv.pdfName;
    }
  }
  if (editId) {
    var index = S[curType].findIndex(function(i) { return i.id === editId; });
    S[curType][index] = invData;
  } else {
    S[curType].push(invData);
    addSupplier(rs);
  }
  save();
  render(curType);
  closeModal('m-inv');
  toast(editId ? '✅ Fattura aggiornata' : '✅ Fattura aggiunta', 'success');
}
function delInv(id, type) {
  var inv = S[type].find(function(i) { return i.id === id; });
  if (!inv) return;
  if (!confirm('Eliminare questa fattura? Tutti i pagamenti verranno rimossi, gli abbinamenti con i movimenti bancari annullati e gli eventuali pagamenti in contanti stornati dalla cassa.')) return;
  // v2.22: prima veniva tolta solo la fattura, lasciando movimenti "riconciliati" con un documento
  // inesistente, compensazioni con note di credito ancora conteggiate, voci di cassa e PDF orfani.
  S.movimenti.forEach(function(m) {
    if (!m.riconciliazioni || !m.riconciliazioni.length) return;
    var prima = m.riconciliazioni.length;
    m.riconciliazioni = m.riconciliazioni.filter(function(r) { return !(r.id === id && r.t === type); });
    if (m.riconciliazioni.length !== prima) m.riconciliato = movRicTotale(m);
  });
  (inv.pagamenti || []).forEach(function(p) {
    if (p._notaId) {
      var nota = S[type].find(function(i) { return i.id === p._notaId; });
      if (nota) nota.pagato = round2(Math.max(0, (nota.pagato || 0) - p.importo));
    } else if (p.mod === 'contanti' && !p._movId) {
      aggiornaCassa(p.importo, type === 'a' ? 'uscita' : 'entrata', 'RETTIFICA eliminazione fattura ' + inv.num + ' - ' + inv.rs, id, p.data);
    }
  });
  if (inv.tipo === 'nota_credito') {
    // Le fatture compensate con questa nota perdono il pagamento corrispondente.
    S[type].forEach(function(d) {
      if (!d.pagamenti || !d.pagamenti.length) return;
      var tolto = 0;
      d.pagamenti = d.pagamenti.filter(function(p) { if (p._notaId === id) { tolto += p.importo; return false; } return true; });
      if (tolto) d.pagato = round2(Math.max(0, (d.pagato || 0) - tolto));
    });
  }
  if (inv.hasPdf) fsPdfDelete(id).catch(function(e) { console.error('delInv (PDF):', e); });
  S[type] = S[type].filter(function(i) { return i.id !== id; });
  save(); render(type); renderMov(); refreshCassa();
  toast('🗑️ Fattura eliminata', 'info');
}
function openPayments(id, type) {
  var inv = S[type].find(function(i) { return i.id === id; });
  if (!inv) return;
  var payDiv = document.getElementById('pay-body');
  var payInfo = document.getElementById('pay-info');
  var extraInfo = '';
  if (ritenutaDoc(inv) > 0) extraInfo += ' - Ritenuta € ' + fmt(ritenutaDoc(inv));
  if (ivaSplitDoc(inv) > 0) extraInfo += ' - IVA split € ' + fmt(ivaSplitDoc(inv));
  if (extraInfo) extraInfo += ' - Netto € ' + fmt(nettoDaPagare(inv));
  payInfo.textContent = (type === 'a' ? 'Attiva' : 'Passiva') + ' - ' + inv.rs + ' - Totale € ' + fmt(inv.tot) + extraInfo + ' - Residuo € ' + fmt(residuo(inv));
  var pagsHtml = '<div class="rec-section-lbl">Pagamenti registrati</div>';
  if (!inv.pagamenti || !inv.pagamenti.length) {
    pagsHtml += '<div style="color:#a8a29e;font-size:.84rem;padding:.5rem 0">Nessun pagamento</div>';
  } else {
    pagsHtml += inv.pagamenti.map(function(p, idx) {
      return '<div class="pay-row"><span>' + (p.data ? p.data.split('-').reverse().join('/') : '—') + '</span><span>' + modLabelHtml(p.mod) + '</span><span>€ ' + fmt(p.importo) + '</span><div style="display:flex; gap:0.2rem;"><button class="ico" style="color:#f59e0b" onclick="openEditPayment(\'' + inv.id + '\',\'' + type + '\',' + idx + ')" title="Modifica pagamento">✏️</button><button class="ico" style="color:#dc2626" onclick="delPayment(\'' + inv.id + '\',\'' + type + '\',' + idx + ')" title="Elimina">🗑️</button></div></div>';
    }).join('');
  }
  pagsHtml += '<div class="rec-section-lbl" style="margin-top:1rem">Aggiungi pagamento manuale</div>' +
    '<div class="pay-form"><input type="date" id="new-pay-data" class="finput" value="' + today() + '"><select id="new-pay-mod" class="fselect">' + modOptions() + '</select><input type="number" id="new-pay-imp" class="finput" step="0.01" placeholder="Importo €" value="' + round2(residuo(inv)) + '"><button class="btn btn-blue btn-sm" onclick="addPaymentManually(\'' + inv.id + '\',\'' + type + '\')">➕ Aggiungi</button></div>' +
    '<div style="margin-top: 1rem; text-align: center; display: flex; gap: 0.5rem; justify-content: center;">' +
    '<button class="btn btn-neutral btn-sm" onclick="openLinkToMovement(\'' + inv.id + '\',\'' + type + '\')">🔗 Collega a movimento bancario</button>' +
    '<button class="btn btn-neutral btn-sm" onclick="openCreditNoteCompensation(\'' + inv.id + '\',\'' + type + '\')">📄 Compensa con nota di credito</button>' +
    '</div>';
  payDiv.innerHTML = pagsHtml;
  openModal('m-pay');
}
function addPaymentManually(id, type) {
  var inv = S[type].find(function(i) { return i.id === id; });
  if (!inv) return;
  var data = document.getElementById('new-pay-data').value;
  var mod = document.getElementById('new-pay-mod').value;
  var imp = parseFloat(document.getElementById('new-pay-imp').value);
  if (isNaN(imp) || imp <= 0) { toast('Importo non valido', 'error'); return; }
  var res = residuo(inv);
  if (imp > res) { toast("L'importo supera il residuo (€ " + fmt(res) + ")", 'warn'); return; }
  inv.pagamenti = inv.pagamenti || [];
  inv.pagamenti.push({ data: data, importo: imp, mod: mod });
  inv.pagato = round2((inv.pagato || 0) + imp);
  if (mod === 'contanti') {
    var tipoCassa = type === 'a' ? 'entrata' : 'uscita';
    var descrizione = 'Pagamento manuale fattura ' + inv.num + ' - ' + inv.rs;
    aggiornaCassa(imp, tipoCassa, descrizione, inv.id, data);
  }
  save(); render(type); openPayments(id, type);
  toast('💳 Pagamento aggiunto', 'success');
}
function delPayment(invId, type, idx) {
  var inv = S[type].find(function(i) { return i.id === invId; });
  if (!inv) return;
  var pag = inv.pagamenti[idx];
  if (!pag) return;
  if (pag._movId) {
    var movimento = S.movimenti.find(function(m) { return m.id === pag._movId; });
    if (movimento) {
      // v2.22: rimuove SOLO l'abbinamento di questo pagamento (stesso importo), non tutti quelli
      // della fattura sullo stesso movimento
      var ricList = movimento.riconciliazioni || [];
      var ricIdx = ricList.findIndex(function(r) { return r.id === inv.id && r.t === type && Math.abs(r.imp - pag.importo) < 0.01; });
      if (ricIdx === -1) ricIdx = ricList.findIndex(function(r) { return r.id === inv.id && r.t === type; });
      if (ricIdx !== -1) ricList.splice(ricIdx, 1);
      movimento.riconciliato = movRicTotale(movimento);
    }
  }
  if (pag.mod === 'contanti' && !pag._movId) { // v2.22: i pagamenti collegati alla banca non erano mai entrati in cassa
    var tipoRettifica = type === 'a' ? 'uscita' : 'entrata';
    var descrizioneRettifica = 'RETTIFICA eliminazione pagamento fattura ' + inv.num + ' - ' + inv.rs;
    aggiornaCassa(pag.importo, tipoRettifica, descrizioneRettifica, invId, pag.data);
  } else if (pag.mod === 'nota_credito' && pag._notaId) {
    var nota = S[type].find(function(i) { return i.id === pag._notaId; });
    if (nota) {
      nota.pagato = round2(Math.max(0, (nota.pagato || 0) - pag.importo));
    }
  }
  inv.pagamenti.splice(idx, 1);
  inv.pagato = round2(Math.max(0, (inv.pagato || 0) - pag.importo));
  save();
  render(type);
  renderMov();
  openPayments(invId, type);
  toast('🗑️ Pagamento rimosso e riconciliazione annullata', 'info');
}
function openAddMov() {
  document.getElementById('mov-data').value = today();
  document.getElementById('mov-tipo').value = 'e';
  document.getElementById('mov-desc').value = '';
  document.getElementById('mov-imp').value = '';
  aggiornaSelectBanche();
  openModal('m-mov');
}
function saveMov() {
  var data = document.getElementById('mov-data').value;
  var tipo = document.getElementById('mov-tipo').value;
  var desc = document.getElementById('mov-desc').value.trim();
  var imp = parseFloat(document.getElementById('mov-imp').value);
  var bancaId = document.getElementById('mov-banca').value;
  if (!data || !desc || isNaN(imp) || imp <= 0) { toast('Compila tutti i campi', 'error'); return; }
  var entrata = tipo === 'e' ? imp : 0;
  var uscita = tipo === 'u' ? imp : 0;
  S.movimenti.push({ id: uid(), data: data, descrizione: desc, entrata: entrata, uscita: uscita, riconciliato: 0, riconciliazioni: [], src: 'manual', bancaId: bancaId });
  save(); renderMov(); closeModal('m-mov');
  toast('➕ Movimento aggiunto', 'success');
}
function openPDF(id, type) {
  var inv = S[type].find(function(i) { return i.id === id; });
  if (!inv || !inv.hasPdf) { toast('Nessun PDF allegato', 'warn'); return; }
  fsPdfGet(id).then(function(b64) {
    if (b64) {
      var embed = document.getElementById('pdf-embed');
      if (embed) {
        embed.src = b64;
        document.getElementById('pdf-title').textContent = 'PDF: ' + inv.rs + ' - ' + inv.num;
        openModal('m-pdf');
      } else {
        var a = document.createElement('a');
        a.href = b64;
        a.download = inv.num + '.pdf';
        a.click();
        toast('PDF aperto in download (embed non disponibile)', 'info');
      }
    } else {
      toast('PDF non trovato', 'error');
    }
  }).catch(function() { toast('Errore nel caricamento del PDF', 'error'); });
}
function openPDFArchive(id, type) {
  var inv = S.archive.docs.find(function(d) { return d.id === id && d._originalType === type; });
  if (!inv || !inv.hasPdf) { toast('Nessun PDF allegato nell\'archivio', 'warn'); return; }
  fsPdfGet(id).then(function(b64) {
    if (b64) {
      var embed = document.getElementById('pdf-embed');
      if (embed) {
        embed.src = b64;
        document.getElementById('pdf-title').textContent = 'PDF (archivio): ' + inv.rs + ' - ' + inv.num;
        openModal('m-pdf');
      } else {
        var a = document.createElement('a');
        a.href = b64;
        a.download = inv.num + '.pdf';
        a.click();
        toast('PDF aperto in download', 'info');
      }
    } else {
      toast('PDF non trovato', 'error');
    }
  }).catch(function() { toast('Errore nel caricamento del PDF', 'error'); });
}
function exportData() {
  var dataStr = stateToJSON();
  var blob = new Blob([dataStr], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'fatturemanager_backup_' + new Date().toISOString().slice(0,19) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('📤 Backup esportato', 'success');
}
function importData() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var text = await file.text();
    try {
      var data = JSON.parse(text);
      applyJSON(data);
      initBanche(); aggiornaSelectBanche();
      save(); render('a'); render('p'); renderMov(); refreshCassa(); renderArchiveDocs('a'); renderArchiveDocs('p'); renderArchiveMovs();
      toast('✅ Dati importati', 'success');
    } catch (err) { toast('❌ File JSON non valido', 'error'); }
  };
  input.click();
}
function clearAll() {
  if (!confirm('⚠️ ATTENZIONE: cancellerà tutti i dati, comprese fatture e movimenti. Procedere?')) return;
  S = { a: [], p: [], suppliers: [], customMods: [], movimenti: [], cassa: { saldo: 0, movimenti: [] }, banche: [], archive: { docs: [], movimenti: [] }, regoleChiusura: [] };
  _selectedArchiveDocsA.clear();
  _selectedArchiveDocsP.clear();
  _selectedArchiveMovs.clear();
  initBanche(); aggiornaSelectBanche();
  save(); render('a'); render('p'); renderMov(); refreshCassa(); renderArchiveDocs('a'); renderArchiveDocs('p'); renderArchiveMovs();
  toast('🗑️ Tutti i dati cancellati', 'info');
}
function exportCSV(type) {
  var data = S[type];
  if (!data.length) { toast('Nessuna fattura da esportare', 'warn'); return; }
  var headers = ['Ragione Sociale', 'Numero', 'Data', 'Scadenza', 'Imponibile', 'IVA %', 'Tot. IVA', 'Totale', 'Ritenuta', 'IVA split payment', 'Netto da pagare', 'Pagato', 'Residuo', 'Note'];
  var rows = data.map(function(i) {
    return [i.rs, i.num, i.data, i.scad || '', i.imp, i.aliq, i.totiva, i.tot, ritenutaDoc(i), ivaSplitDoc(i), nettoDaPagare(i), i.pagato || 0, residuo(i), i.note || ''];
  });
  var csv = [headers].concat(rows).map(function(row) {
    return row.map(function(cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  var url = URL.createObjectURL(blob);
  link.href = url;
  link.setAttribute('download', 'fatture_' + type + '_' + new Date().toISOString().slice(0,19) + '.csv');
  link.click();
  URL.revokeObjectURL(url);
  toast('📊 CSV esportato', 'success');
}

// ======================== REPORT IVA PERIODICO ========================
var _lastReportIVA = null;
function isoLocal(d) {
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}
function openReportIVA() {
  openModal('m-report-iva');
  setReportIVAPeriodo('mese');
}
function setReportIVAPeriodo(kind) {
  var now = new Date();
  var y = now.getFullYear(), m = now.getMonth();
  var dal, al;
  if (kind === 'mese') { dal = new Date(y, m, 1); al = new Date(y, m + 1, 0); }
  else if (kind === 'trimestre') { var q = Math.floor(m / 3); dal = new Date(y, q * 3, 1); al = new Date(y, q * 3 + 3, 0); }
  else { dal = new Date(y, 0, 1); al = new Date(y, 11, 31); }
  document.getElementById('riva-dal').value = isoLocal(dal);
  document.getElementById('riva-al').value = isoLocal(al);
  renderReportIVA();
}
// Aggrega imponibile/IVA per aliquota, separando vendite (attive) e acquisti (passive).
// Le proforma sono escluse perché non hanno rilevanza fiscale IVA. Note di credito e acconti
// sono inclusi: le prime hanno righeIva con segno negativo (sottraggono correttamente).
function buildReportIVA(dal, al) {
  var vendite = new Map(), acquisti = new Map();
  function addRighe(map, doc) {
    var righe = (doc.righeIva && doc.righeIva.length) ? doc.righeIva : [{ aliq: 0, imp: doc.imp || 0, iva: doc.totiva || 0 }];
    righe.forEach(function(r) {
      var key = r.aliq || 0;
      if (!map.has(key)) map.set(key, { imp: 0, iva: 0 });
      var b = map.get(key);
      b.imp = round2(b.imp + (r.imp || 0));
      b.iva = round2(b.iva + (r.iva || 0));
    });
  }
  function inPeriodo(doc) {
    if (doc.tipo === 'proforma') return false;
    if (dal && doc.data < dal) return false;
    if (al && doc.data > al) return false;
    return true;
  }
  // v2.23: IVA in split payment — sulle vendite la versa il cliente PA, quindi NON è a debito.
  var splitVendite = 0, splitAcquisti = 0;
  function segnoDoc(doc) { return (doc.tot || 0) < 0 ? -1 : 1; }
  S.a.forEach(function(doc) { if (inPeriodo(doc)) { addRighe(vendite, doc); splitVendite = round2(splitVendite + segnoDoc(doc) * ivaSplitDoc(doc)); } });
  S.p.forEach(function(doc) { if (inPeriodo(doc)) { addRighe(acquisti, doc); splitAcquisti = round2(splitAcquisti + segnoDoc(doc) * ivaSplitDoc(doc)); } });
  var aliqSet = new Set(Array.from(vendite.keys()).concat(Array.from(acquisti.keys())));
  var aliqSorted = Array.from(aliqSet).sort(function(a, b) { return a - b; });
  var righe = aliqSorted.map(function(aliq) {
    var v = vendite.get(aliq) || { imp: 0, iva: 0 };
    var a = acquisti.get(aliq) || { imp: 0, iva: 0 };
    return { aliq: aliq, impVendite: v.imp, ivaVendite: v.iva, impAcquisti: a.imp, ivaAcquisti: a.iva };
  });
  var totImpVendite = round2(righe.reduce(function(s, r) { return s + r.impVendite; }, 0));
  var totIvaVendite = round2(righe.reduce(function(s, r) { return s + r.ivaVendite; }, 0));
  var totImpAcquisti = round2(righe.reduce(function(s, r) { return s + r.impAcquisti; }, 0));
  var totIvaAcquisti = round2(righe.reduce(function(s, r) { return s + r.ivaAcquisti; }, 0));
  return { righe: righe, totImpVendite: totImpVendite, totIvaVendite: totIvaVendite, totImpAcquisti: totImpAcquisti, totIvaAcquisti: totIvaAcquisti,
    splitVendite: splitVendite, splitAcquisti: splitAcquisti,
    saldo: round2(totIvaVendite - splitVendite - totIvaAcquisti) };
}
// v2.23: riepilogo ritenute d'acconto nel periodo.
// - Attive: ritenute SUBITE (le versa il cliente; per te sono un credito d'imposta) — per data documento.
// - Passive: ritenute OPERATE da te sui compensi pagati (professionisti ecc.), da versare con F24
//   (tipicamente codice tributo 1040) entro il 16 del mese successivo al PAGAMENTO — per data
//   dell'ultimo pagamento registrato. Le fatture non ancora pagate sono elencate a parte.
function scadenzaF24(dataPag) {
  if (!dataPag) return '';
  var d = new Date(dataPag + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return isoLocal(new Date(d.getFullYear(), d.getMonth() + 1, 16));
}
function buildRitenute(dal, al) {
  function inRange(data) { return data && (!dal || data >= dal) && (!al || data <= al); }
  var attive = S.a.filter(function(d) { return ritenutaDoc(d) > 0 && d.tipo !== 'proforma' && inRange(d.data); })
    .map(function(d) { return { doc: d, ritenuta: ritenutaDoc(d) * ((d.tot || 0) < 0 ? -1 : 1) }; });
  var passive = [], passiveNonPagate = [];
  S.p.forEach(function(d) {
    if (!(ritenutaDoc(d) > 0) || d.tipo === 'proforma') return;
    var pags = (d.pagamenti || []).filter(function(p) { return p.data; }).sort(function(a, b) { return a.data.localeCompare(b.data); });
    var ultimo = pags.length ? pags[pags.length - 1].data : '';
    var segno = (d.tot || 0) < 0 ? -1 : 1;
    if (!ultimo) { if (inRange(d.data)) passiveNonPagate.push({ doc: d, ritenuta: ritenutaDoc(d) * segno }); return; }
    if (inRange(ultimo)) passive.push({ doc: d, ritenuta: ritenutaDoc(d) * segno, dataPag: ultimo, scadF24: scadenzaF24(ultimo), parziale: residuo(d) > 0 });
  });
  passive.sort(function(a, b) { return a.dataPag.localeCompare(b.dataPag); });
  var sum = function(arr) { return round2(arr.reduce(function(s, r) { return s + r.ritenuta; }, 0)); };
  return { attive: attive, passive: passive, passiveNonPagate: passiveNonPagate, totAttive: sum(attive), totPassive: sum(passive), totNonPagate: sum(passiveNonPagate) };
}
function renderReportIVA() {
  var dal = document.getElementById('riva-dal').value;
  var al = document.getElementById('riva-al').value;
  var rep = buildReportIVA(dal, al);
  _lastReportIVA = rep;
  renderRitenute(dal, al);
  var body = document.getElementById('riva-body');
  if (!body) return;
  if (!rep.righe.length) {
    body.innerHTML = '<p style="color:#a8a29e;padding:1rem 0">Nessun documento fiscale (fattura/nota credito/acconto) nel periodo selezionato.</p>';
    return;
  }
  var td = 'style="padding:.5rem;border:1px solid #e5e3dc"';
  var tdn = 'style="padding:.5rem;border:1px solid #e5e3dc;text-align:right"';
  var rows = rep.righe.map(function(r) {
    return '<tr><td ' + td + '>' + fmt(r.aliq) + '%</td>' +
      '<td ' + tdn + '>€ ' + fmt(r.impVendite) + '</td><td ' + tdn + '>€ ' + fmt(r.ivaVendite) + '</td>' +
      '<td ' + tdn + '>€ ' + fmt(r.impAcquisti) + '</td><td ' + tdn + '>€ ' + fmt(r.ivaAcquisti) + '</td></tr>';
  }).join('');
  body.innerHTML =
    '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.85rem">' +
    '<thead><tr style="background:#f5f4f0"><th ' + td + '>Aliquota</th><th ' + tdn + '>Imponibile Vendite</th><th ' + tdn + '>IVA Vendite (debito)</th><th ' + tdn + '>Imponibile Acquisti</th><th ' + tdn + '>IVA Acquisti (credito)</th></tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '<tfoot><tr style="background:#f5f4f0;font-weight:700"><td ' + td + '>Totale</td><td ' + tdn + '>€ ' + fmt(rep.totImpVendite) + '</td><td ' + tdn + '>€ ' + fmt(rep.totIvaVendite) + '</td><td ' + tdn + '>€ ' + fmt(rep.totImpAcquisti) + '</td><td ' + tdn + '>€ ' + fmt(rep.totIvaAcquisti) + '</td></tr></tfoot>' +
    '</table></div>' +
    '<div style="margin-top:1rem;padding:.75rem 1rem;background:' + (rep.saldo >= 0 ? '#fef2f2' : '#f0fdf4') + ';border-radius:8px;font-size:.95rem">' +
    '<strong>IVA a debito (vendite):</strong> € ' + fmt(round2(rep.totIvaVendite - rep.splitVendite)) + ' — <strong>IVA a credito (acquisti):</strong> € ' + fmt(rep.totIvaAcquisti) + '<br>' +
    (rep.splitVendite ? '<span style="font-size:.85rem">di cui escluse dal debito: € ' + fmt(rep.splitVendite) + ' di IVA vendite in <strong>split payment</strong> (versata dal cliente PA)</span><br>' : '') +
    (rep.splitAcquisti ? '<span style="font-size:.85rem">ℹ️ IVA acquisti in split payment: € ' + fmt(rep.splitAcquisti) + ' (inclusa nel credito — verifica il trattamento con il commercialista)</span><br>' : '') +
    '<strong style="font-size:1.1rem">' + (rep.saldo >= 0 ? '💸 Saldo a debito (da versare): € ' + fmt(rep.saldo) : '💰 Saldo a credito: € ' + fmt(Math.abs(rep.saldo))) + '</strong>' +
    '<p style="font-size:.72rem;color:#78716c;margin-top:.4rem">⚠️ Report indicativo basato sulla data documento in archivio (competenza), non su esigibilità o registri IVA ufficiali — verifica sempre con il tuo commercialista prima della liquidazione effettiva.</p>' +
    '</div>';
}
var _lastRitenute = null;
function renderRitenute(dal, al) {
  var box = document.getElementById('riva-ritenute');
  if (!box) return;
  var r = buildRitenute(dal, al);
  _lastRitenute = r;
  if (!r.attive.length && !r.passive.length && !r.passiveNonPagate.length) {
    box.innerHTML = '<p style="color:#a8a29e;font-size:.85rem">Nessuna ritenuta d\'acconto nel periodo.</p>';
    return;
  }
  var td = 'style="padding:.4rem;border:1px solid #e5e3dc"', tdn = 'style="padding:.4rem;border:1px solid #e5e3dc;text-align:right"';
  function dt(d) { return d ? d.split('-').reverse().join('/') : '—'; }
  var html = '<div class="rec-section-lbl" style="margin-top:0">🧾 Ritenute d\'acconto nel periodo</div>';
  html += '<div style="display:flex;gap:1rem;flex-wrap:wrap;font-size:.9rem;margin-bottom:.6rem">' +
    '<div><strong>Subite (attive, a credito):</strong> € ' + fmt(r.totAttive) + ' <span style="color:#78716c">(' + r.attive.length + ' doc.)</span></div>' +
    '<div><strong>Da versare con F24 (passive pagate):</strong> € ' + fmt(r.totPassive) + ' <span style="color:#78716c">(' + r.passive.length + ' doc.)</span></div>' +
    (r.passiveNonPagate.length ? '<div><strong>Su passive non ancora pagate:</strong> € ' + fmt(r.totNonPagate) + '</div>' : '') + '</div>';
  if (r.passive.length) {
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem;margin-bottom:.6rem"><thead><tr style="background:#f5f4f0"><th ' + td + '>Fornitore</th><th ' + td + '>N.</th><th ' + td + '>Pagata il</th><th ' + tdn + '>Ritenuta</th><th ' + td + '>Scadenza F24</th></tr></thead><tbody>' +
      r.passive.map(function(x) {
        return '<tr><td ' + td + '>' + esc(x.doc.rs) + '</td><td ' + td + '>' + esc(x.doc.num) + '</td><td ' + td + '>' + dt(x.dataPag) + (x.parziale ? ' <span style="color:#b45309">(parziale)</span>' : '') + '</td><td ' + tdn + '>€ ' + fmt(x.ritenuta) + '</td><td ' + td + '>' + dt(x.scadF24) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  if (r.attive.length) {
    html += '<details style="font-size:.8rem;margin-bottom:.4rem"><summary style="cursor:pointer">Dettaglio ritenute subite sulle fatture attive</summary><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;margin-top:.4rem"><thead><tr style="background:#f5f4f0"><th ' + td + '>Cliente</th><th ' + td + '>N.</th><th ' + td + '>Data</th><th ' + tdn + '>Ritenuta</th></tr></thead><tbody>' +
      r.attive.map(function(x) { return '<tr><td ' + td + '>' + esc(x.doc.rs) + '</td><td ' + td + '>' + esc(x.doc.num) + '</td><td ' + td + '>' + dt(x.doc.data) + '</td><td ' + tdn + '>€ ' + fmt(x.ritenuta) + '</td></tr>'; }).join('') +
      '</tbody></table></div></details>';
  }
  html += '<p style="font-size:.72rem;color:#78716c">⚠️ Indicativo: la scadenza F24 è il 16 del mese successivo all\'ultimo pagamento registrato. Se una fattura è pagata in più rate, la ritenuta va versata in proporzione a ogni rata — verifica con il commercialista.</p>';
  box.innerHTML = html;
}
function exportRitenuteCSV() {
  if (!_lastRitenute || (!_lastRitenute.attive.length && !_lastRitenute.passive.length && !_lastRitenute.passiveNonPagate.length)) { toast('Nessuna ritenuta nel periodo', 'warn'); return; }
  var rows = [['Tipo', 'Ragione Sociale', 'Numero', 'Data documento', 'Data pagamento', 'Ritenuta', 'Scadenza F24']];
  _lastRitenute.passive.forEach(function(x) { rows.push(['Passiva - da versare', x.doc.rs, x.doc.num, x.doc.data, x.dataPag, x.ritenuta, x.scadF24]); });
  _lastRitenute.passiveNonPagate.forEach(function(x) { rows.push(['Passiva - non pagata', x.doc.rs, x.doc.num, x.doc.data, '', x.ritenuta, '']); });
  _lastRitenute.attive.forEach(function(x) { rows.push(['Attiva - subita', x.doc.rs, x.doc.num, x.doc.data, '', x.ritenuta, '']); });
  var csv = rows.map(function(row) { return row.map(function(cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  var url = URL.createObjectURL(blob);
  link.href = url;
  link.setAttribute('download', 'ritenute_' + (document.getElementById('riva-dal').value || '') + '_' + (document.getElementById('riva-al').value || '') + '.csv');
  link.click();
  URL.revokeObjectURL(url);
  toast('📊 CSV ritenute esportato', 'success');
}
function exportReportIVACSV() {
  if (!_lastReportIVA || !_lastReportIVA.righe.length) { toast('Genera prima il report', 'warn'); return; }
  var dal = document.getElementById('riva-dal').value || '';
  var al = document.getElementById('riva-al').value || '';
  var headers = ['Aliquota %', 'Imponibile Vendite', 'IVA Vendite (debito)', 'Imponibile Acquisti', 'IVA Acquisti (credito)'];
  var rows = _lastReportIVA.righe.map(function(r) { return [r.aliq, r.impVendite, r.ivaVendite, r.impAcquisti, r.ivaAcquisti]; });
  rows.push(['TOTALE', _lastReportIVA.totImpVendite, _lastReportIVA.totIvaVendite, _lastReportIVA.totImpAcquisti, _lastReportIVA.totIvaAcquisti]);
  if (_lastReportIVA.splitVendite || _lastReportIVA.splitAcquisti) rows.push(['di cui split payment', '', _lastReportIVA.splitVendite, '', _lastReportIVA.splitAcquisti]);
  rows.push(['SALDO (debito + / credito -)', '', _lastReportIVA.saldo, '', '']);
  var csv = [headers].concat(rows).map(function(row) {
    return row.map(function(cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  var url = URL.createObjectURL(blob);
  link.href = url;
  link.setAttribute('download', 'report_iva_' + dal + '_' + al + '.csv');
  link.click();
  URL.revokeObjectURL(url);
  toast('📊 CSV esportato', 'success');
}

// ======================== VERIFICA PDF ALLEGATI ========================
function openPdfAudit() {
  var body = document.getElementById('pdf-audit-body');
  if (body) body.innerHTML = '<p style="color:#a8a29e">Premi "Avvia verifica" per controllare tutti i PDF allegati alle fatture attive, passive e archiviate.</p>';
  openModal('m-pdf-audit');
}
async function runPdfAudit() {
  var body = document.getElementById('pdf-audit-body');
  if (!body) return;
  body.innerHTML = '<p>⏳ Verifica in corso, un istante...</p>';
  var problems = await auditPdfAttachments();
  if (!problems.length) {
    body.innerHTML = '<p style="color:#16a34a;font-weight:600">✅ Tutti i PDF allegati risultano leggibili.</p>';
    return;
  }
  body.innerHTML = '<p style="color:#dc2626;font-weight:600;margin-bottom:.75rem">⚠️ ' + problems.length + ' PDF non leggibili — probabilmente andranno ricaricati.</p>' +
    '<div class="tbl-wrap"><table><thead><tr><th>Tipo</th><th>Ragione Sociale</th><th>N. Fattura</th><th>Data</th><th>Problema</th><th></th></tr></thead><tbody>' +
    problems.map(function(p) {
      var tipoLbl = (p.type === 'a' ? 'Attiva' : 'Passiva') + (p.archived ? ' (archivio)' : '');
      var dataFmt = p.data ? p.data.split('-').reverse().join('/') : '—';
      var actionBtn = p.archived
        ? '<button class="btn btn-neutral btn-sm" onclick="goToArchivedDocForPdf(\'' + p.type + '\',\'' + jsq(p.num) + '\')">🗄️ Vai in Archivio</button>'
        : '<button class="btn btn-neutral btn-sm" onclick="goToDocForPdf(\'' + p.id + '\',\'' + p.type + '\')">✏️ Apri e ricarica</button>';
      return '<tr><td>' + tipoLbl + '</td><td>' + esc(p.rs) + '</td><td>' + esc(p.num) + '</td><td>' + dataFmt + '</td><td style="font-size:.8rem;color:#78716c">' + p.reason + '</td><td>' + actionBtn + '</td></tr>';
    }).join('') +
    '</tbody></table></div>' +
    '<p style="font-size:.72rem;color:#78716c;margin-top:.75rem">Per le fatture attive/passive puoi riaprirle e ricaricare il PDF direttamente. Per quelle in archivio, individuale nell\'elenco archiviato, ripristinale con ⬅️ e poi ricarica il PDF dalla scheda fattura.</p>';
}
function goToDocForPdf(id, type) {
  closeModal('m-pdf-audit');
  switchTab(type === 'a' ? 'tab-attive' : 'tab-passive');
  editInv(id, type);
}
function goToArchivedDocForPdf(type, num) {
  closeModal('m-pdf-audit');
  switchTab('tab-archivio');
  switchArchiveSubTab(type === 'a' ? 'arch-a' : 'arch-p');
  var srch = document.getElementById('srch-arch-' + type);
  if (srch) { srch.value = num; }
  if (typeof renderArchiveDocs === 'function') renderArchiveDocs(type);
  toast('Fattura trovata nell\'elenco: ripristinala con ⬅️, poi ricarica il PDF dalla scheda', 'info');
}

// ======================== STAMPA RIEPILOGO ========================
async function exportHTMLReport() {
  var reportWindow = window.open('', '_blank');
  if (!reportWindow) {
    toast('Impossibile aprire la finestra di stampa (blocco popup?)', 'error');
    return;
  }
  var style = '<style>' +
    '*{box-sizing:border-box;}body{font-family:\'DM Sans\',Arial,sans-serif;margin:2rem auto;padding:1rem;max-width:1280px;background:#fff;color:#111;}' +
    'h1,h2,h3{margin-top:1.8rem;margin-bottom:0.75rem;font-weight:600;}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:1.5rem;font-size:0.8rem;border:1px solid #ccc;}' +
    'th,td{border:1px solid #aaa;padding:0.5rem 0.4rem;vertical-align:top;word-break:break-word;white-space:normal;}' +
    'th{background-color:#f2f2f2;font-weight:700;text-align:left;}' +
    'td.num{text-align:right;}.totals{margin:0.5rem 0 1rem;font-weight:bold;font-size:0.9rem;}' +
    '.page-break{page-break-before:always;}footer{margin-top:2rem;font-size:0.7rem;color:#666;text-align:center;border-top:1px solid #ddd;padding-top:1rem;}' +
    'table.ft{table-layout:fixed;width:100%;}table.ft th,table.ft td{padding:0.5rem 0.4rem;vertical-align:top;}' +
    'table.ft th:nth-child(1),table.ft td:nth-child(1){width:5%;}' +
    'table.ft th:nth-child(2),table.ft td:nth-child(2){width:8%;}' +
    'table.ft th:nth-child(3),table.ft td:nth-child(3){width:25%;}' +
    'table.ft th:nth-child(4),table.ft td:nth-child(4){width:8%;}' +
    'table.ft th:nth-child(5),table.ft td:nth-child(5){width:25%;}' +
    'table.ft th:nth-child(6),table.ft td:nth-child(6){width:8%;}' +
    'table.ft th:nth-child(7),table.ft td:nth-child(7){width:21%;}' +
    '.pagamenti-dettaglio{margin:0;padding-left:0;font-size:0.7rem;line-height:1.3;}' +
    '.pagamenti-dettaglio span{display:inline-block;background:#f5f4f0;border-radius:4px;padding:0.1rem 0.3rem;margin:0.1rem;white-space:normal;word-break:break-word;max-width:100%;}' +
    'table.mv{table-layout:fixed;width:100%;}table.mv th,table.mv td{padding:0.4rem 0.3rem;vertical-align:top;word-break:break-word;}' +
    'table.mv th{background-color:#eef2ff;}' +
    'table.mv th:nth-child(1),table.mv td:nth-child(1){width:9%;}' +
    'table.mv th:nth-child(2),table.mv td:nth-child(2){width:26%;}' +
    'table.mv th:nth-child(3),table.mv td:nth-child(3){width:10%;}' +
    'table.mv th:nth-child(4),table.mv td:nth-child(4){width:10%;}' +
    'table.mv th:nth-child(5),table.mv td:nth-child(5){width:8%;}' +
    'table.mv th:nth-child(6),table.mv td:nth-child(6){width:37%;}' +
    '.pdf-frame{width:100%;max-width:160px;height:auto;border:1px solid #ccc;background:#f9f9f9;aspect-ratio:160/120;}' +
    '.pdf-link{color:#2563eb;text-decoration:none;cursor:pointer;display:inline-block;margin-top:4px;font-size:0.7rem;word-break:break-all;}' +
    '.pdf-link:hover{text-decoration:underline;}tr{page-break-inside:avoid;break-inside:avoid;}' +
    '.text-green{color:#16a34a;}.text-red{color:#dc2626;}' +
    '<\/style>';
  var html = '<!DOCTYPE html><html><head><title>Riepilogo FattureManager con anteprime PDF<\/title>' + style + '<\/head><body>';
  html += '<h1>📊 Riepilogo Generale FattureManager<\/h1><p>Data: ' + new Date().toLocaleString() + '<\/p>';
  var activeSorted = S.a.slice().sort(function(a, b) { return (a.data || '').localeCompare(b.data || '') || naturalCmp(a.num, b.num); });
  var totalAttive = round2(S.a.reduce(function(s, i) { return s + (i.tot || 0); }, 0));
  html += '<h2>📈 Fatture Attive<\/h2>';
  if (activeSorted.length) {
    html += '<table class="ft"><thead><tr><th>N°<\/th><th>Data<\/th><th>Cliente<\/th><th class="num">Totale<\/th><th>Pagamenti<\/th><th class="num">Residuo<\/th><th>Anteprima PDF<\/th><\/tr><\/thead><tbody>';
    for (var idx = 0; idx < activeSorted.length; idx++) {
      var inv = activeSorted[idx];
      var numProgressivo = idx + 1;
      var pagamentiHtml = '';
      if (inv.pagamenti && inv.pagamenti.length) {
        pagamentiHtml = '<div class="pagamenti-dettaglio">' + inv.pagamenti.map(function(p) {
          return '<span>' + (p.data ? p.data.split('-').reverse().join('/') : '—') + ' ' + modLabelHtml(p.mod) + ' ' + fmt(p.importo) + ' €<\/span>';
        }).join('') + '<\/div>';
      } else {
        pagamentiHtml = '—';
      }
      var previewCell = '—';
      if (inv.hasPdf && inv.pdfName) {
        var dataURL = await fsPdfGet(inv.id);
        if (dataURL) {
          previewCell = '<iframe class="pdf-frame" src="' + dataURL + '" title="Anteprima ' + esc(inv.pdfName) + '"><\/iframe><br>' +
            '<a href="#" class="pdf-link" onclick="window.opener.openPDF(\'' + inv.id + '\',\'a\'); return false;">' + esc(inv.pdfName) + '<\/a>';
        } else {
          previewCell = '📄 ' + esc(inv.pdfName) + ' (non visualizzabile)';
        }
      }
      html += '<tr><td class="num">' + numProgressivo + '<\/td><td>' + (inv.data ? inv.data.split('-').reverse().join('/') : '—') + '<\/td><td>' + esc(inv.rs) + '<\/td><td class="num">' + fmt(inv.tot) + ' €<\/td><td>' + pagamentiHtml + '<\/td><td class="num">' + fmt(residuo(inv)) + ' €<\/td><td>' + previewCell + '<\/td><\/tr>';
    }
    html += '<\/tbody></table><div class="totals">Totale attive: ' + fmt(totalAttive) + ' €<\/div>';
  } else {
    html += '<p>Nessuna fattura attiva.<\/p>';
  }
  var passiveSorted = S.p.slice().sort(function(a, b) { return (a.data || '').localeCompare(b.data || '') || naturalCmp(a.num, b.num); });
  var totalPassive = round2(S.p.reduce(function(s, i) { return s + (i.tot || 0); }, 0));
  html += '<h2>📉 Fatture Passive<\/h2>';
  if (passiveSorted.length) {
    html += '<table class="ft"><thead><tr><th>N°<\/th><th>Data<\/th><th>Fornitore<\/th><th class="num">Totale<\/th><th>Pagamenti<\/th><th class="num">Residuo<\/th><th>Anteprima PDF<\/th><\/tr><\/thead><tbody>';
    for (var idx2 = 0; idx2 < passiveSorted.length; idx2++) {
      var inv2 = passiveSorted[idx2];
      var numProgressivo2 = idx2 + 1;
      var pagamentiHtml2 = '';
      if (inv2.pagamenti && inv2.pagamenti.length) {
        pagamentiHtml2 = '<div class="pagamenti-dettaglio">' + inv2.pagamenti.map(function(p) {
          return '<span>' + (p.data ? p.data.split('-').reverse().join('/') : '—') + ' ' + modLabelHtml(p.mod) + ' ' + fmt(p.importo) + ' €<\/span>';
        }).join('') + '<\/div>';
      } else {
        pagamentiHtml2 = '—';
      }
      var previewCell2 = '—';
      if (inv2.hasPdf && inv2.pdfName) {
        var dataURL2 = await fsPdfGet(inv2.id);
        if (dataURL2) {
          previewCell2 = '<iframe class="pdf-frame" src="' + dataURL2 + '" title="Anteprima ' + esc(inv2.pdfName) + '"><\/iframe><br>' +
            '<a href="#" class="pdf-link" onclick="window.opener.openPDF(\'' + inv2.id + '\',\'p\'); return false;">' + esc(inv2.pdfName) + '<\/a>';
        } else {
          previewCell2 = '📄 ' + esc(inv2.pdfName) + ' (non visualizzabile)';
        }
      }
      html += '<tr><td class="num">' + numProgressivo2 + '<\/td><td>' + (inv2.data ? inv2.data.split('-').reverse().join('/') : '—') + '<\/td><td>' + esc(inv2.rs) + '<\/td><td class="num">' + fmt(inv2.tot) + ' €<\/td><td>' + pagamentiHtml2 + '<\/td><td class="num">' + fmt(residuo(inv2)) + ' €<\/td><td>' + previewCell2 + '<\/td><\/tr>';
    }
    html += '<\/tbody></table><div class="totals">Totale passive: ' + fmt(totalPassive) + ' €<\/div>';
  } else {
    html += '<p>Nessuna fattura passiva.<\/p>';
  }
  html += '<div class="totals">Saldo netto: ' + fmt(totalAttive - totalPassive) + ' €<\/div>';
  html += '<div class="page-break"><\/div><h2>🏦 Movimenti Bancari e Riconciliazioni<\/h2>';
  if (S.banche && S.banche.length) {
    for (var b = 0; b < S.banche.length; b++) {
      var banca = S.banche[b];
      var movBanca = S.movimenti.filter(function(m) { return m.bancaId === banca.id; });
      if (!movBanca.length) continue;
      html += '<h3>' + esc(banca.nome) + '<\/h3>';
      html += '<table class="mv"><thead><tr><th>Data<\/th><th>Descrizione<\/th><th class="num">Importo<\/th><th class="num">Riconciliato<\/th><th class="num">Residuo<\/th><th>Abbinamenti / Note<\/th><\/tr><\/thead><tbody>';
      var sortedMov = movBanca.slice().sort(function(a, b) { return (a.data || '').localeCompare(b.data || ''); });
      for (var mi = 0; mi < sortedMov.length; mi++) {
        var mm = sortedMov[mi];
        var importoStr = mm.entrata ? '+' + fmt(mm.entrata) : (mm.uscita ? '-' + fmt(mm.uscita) : '0,00');
        var recs = [];
        if (mm.riconciliazioni && mm.riconciliazioni.length) {
          recs = mm.riconciliazioni.map(function(r) {
            var invDoc = (S[r.t] || []).find(function(i) { return i.id === r.id; });
            return esc((invDoc ? invDoc.rs + ' ' + invDoc.num : 'Fattura') + ' - ' + fmt(r.imp) + ' € (' + modLabel(r.mod) + ')');
          });
        }
        if (mm.chiusureExtra && mm.chiusureExtra.length) {
          recs.push.apply(recs, mm.chiusureExtra.map(function(c) {
            var cat = EXTRA_CAT[c.categoria] || c.categoria || 'Extra';
            var nota = c.nota ? ' (' + c.nota + ')' : '';
            var cassaFlag = c.aggiornaCassa ? ' 💰' : '';
            return esc(cat + ' - ' + fmt(c.imp) + ' € (' + modLabel(c.mod) + ')' + nota) + cassaFlag;
          }));
        }
        var recText = recs.length ? recs.join('<br>') : '—';
        html += '<tr><td>' + (mm.data ? mm.data.split('-').reverse().join('/') : '—') + '<\/td><td>' + esc(mm.descrizione) + '<\/td><td class="num">' + importoStr + '<\/td><td class="num">' + fmt(movRicTotale(mm)) + '<\/td><td class="num">' + fmt(movResiduo(mm)) + '<\/td><td>' + recText + '<\/td><\/tr>';
      }
      html += '<\/tbody></table>';
    }
  } else {
    html += '<p>Nessuna banca definita o movimenti bancari.<\/p>';
  }
  var totalEntrate = S.movimenti.reduce(function(s, m) { return s + (m.entrata || 0); }, 0);
  var totalUscite = S.movimenti.reduce(function(s, m) { return s + (m.uscita || 0); }, 0);
  html += '<div class="totals">Totale entrate: ' + fmt(totalEntrate) + ' € | Uscite: ' + fmt(totalUscite) + ' € | Saldo: ' + fmt(totalEntrate - totalUscite) + ' €<\/div>';
  var months = {};
  S.movimenti.forEach(function(m) {
    if (m.data) {
      var mk = m.data.slice(0, 7);
      if (!months[mk]) months[mk] = { entrate: 0, uscite: 0 };
      months[mk].entrate += m.entrata || 0;
      months[mk].uscite += m.uscita || 0;
    }
  });
  var sortedMonths = Object.keys(months).sort();
  if (sortedMonths.length) {
    html += '<h2>📆 Riepilogo Mensile (da movimenti)<\/h2>';
    html += '<table><thead><tr><th>Mese<\/th><th class="num">Entrate<\/th><th class="num">Uscite<\/th><th class="num">Saldo<\/th><\/tr><\/thead><tbody>';
    for (var mi2 = 0; mi2 < sortedMonths.length; mi2++) {
      var mmm = sortedMonths[mi2];
      var label = mmm.slice(5) + '/' + mmm.slice(2, 4);
      var ent = months[mmm].entrate, usc = months[mmm].uscite;
      html += '<tr><td class="num">' + label + '<\/td><td class="num">' + fmt(ent) + ' €<\/td><td class="num">' + fmt(usc) + ' €<\/td><td class="num">' + fmt(ent - usc) + ' €<\/td><\/tr>';
    }
    html += '<\/tbody></table>';
  }
  html += '<div class="page-break"><\/div><h2>💰 Cassa Contanti<\/h2>';
  html += '<div class="totals">Saldo attuale: ' + fmt(S.cassa ? S.cassa.saldo : 0) + ' €<\/div>';
  var cassaMovimenti = S.cassa ? S.cassa.movimenti : [];
  if (cassaMovimenti.length) {
    html += '<table class="ft"><thead><tr><th>Data<\/th><th>Descrizione<\/th><th class="num">Importo<\/th><\/tr><\/thead><tbody>';
    var sortedCassa = cassaMovimenti.slice().sort(function(a, b) { return (a.data || '').localeCompare(b.data || ''); });
    for (var ci = 0; ci < sortedCassa.length; ci++) {
      var cm = sortedCassa[ci];
      var segno = cm.importo > 0 ? '+' : '';
      html += '<tr><td>' + (cm.data ? cm.data.split('-').reverse().join('/') : '—') + '<\/td><td>' + esc(cm.descrizione) + '<\/td><td class="num">' + segno + '€ ' + fmt(Math.abs(cm.importo)) + '<\/td><\/tr>';
    }
    html += '<\/tbody></table>';
  } else {
    html += '<p>Nessun movimento di cassa registrato.<\/p>';
  }
  html += '<footer>FattureManager Pro - ' + new Date().toLocaleString() + '<\/footer><\/body><\/html>';
  reportWindow.document.write(html);
  reportWindow.document.close();
  setTimeout(function() { reportWindow.print(); }, 500);
}
function openPrintSummary() { exportHTMLReport(); }

// ======================== GRAFICO ========================
function toggleChart() {
  var chartDiv = document.getElementById('chart-section');
  if (chartDiv.style.display === 'none') {
    chartDiv.style.display = 'block';
    renderChart();
  } else {
    chartDiv.style.display = 'none';
  }
}
function renderChart() {
  // v2.22: Chart.js arriva da internet (CDN). Senza connessione (es. chiavetta su un PC offline)
  // "Chart" non esiste: prima l'errore interrompeva l'avvio dell'app a metà (niente controllo
  // integrità né backup). Ora il grafico viene semplicemente saltato.
  if (typeof Chart === 'undefined') {
    var sec = document.getElementById('chart-section');
    if (sec && sec.style.display !== 'none') toast('📊 Grafici non disponibili: libreria non caricata (serve una connessione internet)', 'warn');
    return;
  }
  var clientiMap = new Map();
  S.a.forEach(function(inv) { var imp = inv.imp || 0; clientiMap.set(inv.rs, (clientiMap.get(inv.rs) || 0) + imp); });
  var topClienti = Array.from(clientiMap.entries()).map(function(entry) { return { nome: entry[0], imp: entry[1] }; }).sort(function(a, b) { return b.imp - a.imp; }).slice(0,5);
  var fornitoriMap = new Map();
  S.p.forEach(function(inv) { var imp = inv.imp || 0; fornitoriMap.set(inv.rs, (fornitoriMap.get(inv.rs) || 0) + imp); });
  var topFornitori = Array.from(fornitoriMap.entries()).map(function(entry) { return { nome: entry[0], imp: entry[1] }; }).sort(function(a, b) { return b.imp - a.imp; }).slice(0,5);
  var ctxClienti = document.getElementById('chartTopClienti') ? document.getElementById('chartTopClienti').getContext('2d') : null;
  var ctxFornitori = document.getElementById('chartTopFornitori') ? document.getElementById('chartTopFornitori').getContext('2d') : null;
  if (!ctxClienti || !ctxFornitori) return;
  if (chartClienti) chartClienti.destroy();
  if (chartFornitori) chartFornitori.destroy();
  chartClienti = new Chart(ctxClienti, {
    type: 'bar',
    data: { labels: topClienti.map(function(c) { return c.nome; }), datasets: [{ label: 'Imponibile fatturato (€)', data: topClienti.map(function(c) { return c.imp; }), backgroundColor: '#3b82f6', borderColor: '#1e40af', borderWidth: 1 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: function(ctx) { return '€ ' + fmt(ctx.raw); } } } }, scales: { x: { title: { display: true, text: 'Imponibile (€)' }, ticks: { callback: function(v) { return '€ ' + fmt(v); } } }, y: { title: { display: true, text: 'Cliente' } } } }
  });
  chartFornitori = new Chart(ctxFornitori, {
    type: 'bar',
    data: { labels: topFornitori.map(function(f) { return f.nome; }), datasets: [{ label: 'Imponibile ricevuto (€)', data: topFornitori.map(function(f) { return f.imp; }), backgroundColor: '#ef4444', borderColor: '#b91c1c', borderWidth: 1 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: function(ctx) { return '€ ' + fmt(ctx.raw); } } } }, scales: { x: { title: { display: true, text: 'Imponibile (€)' }, ticks: { callback: function(v) { return '€ ' + fmt(v); } } }, y: { title: { display: true, text: 'Fornitore' } } } }
  });
  renderChartCashflow();
}
// Aggrega entrate/uscite mensili unendo movimenti bancari (S.movimenti) e cassa (S.cassa.movimenti).
// Il "flusso cumulato" è la somma progressiva dei netti mensili nella sola finestra mostrata,
// non il saldo di conto reale (che dipende da un saldo iniziale che l'app non registra).
function buildCashflowMonthly(monthsBack) {
  var map = new Map();
  function addTx(dateStr, net) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return;
    var key = dateStr.slice(0, 7);
    if (!map.has(key)) map.set(key, { entrate: 0, uscite: 0 });
    var b = map.get(key);
    if (net >= 0) b.entrate = round2(b.entrate + net); else b.uscite = round2(b.uscite + Math.abs(net));
  }
  (S.movimenti || []).forEach(function(m) { addTx(m.data, round2((m.entrata || 0) - (m.uscita || 0))); });
  (S.cassa && S.cassa.movimenti || []).forEach(function(m) { addTx(m.data, m.importo || 0); });
  var keys = Array.from(map.keys()).sort();
  if (monthsBack && keys.length > monthsBack) keys = keys.slice(keys.length - monthsBack);
  var cum = 0;
  return keys.map(function(k) {
    var b = map.get(k);
    var netto = round2(b.entrate - b.uscite);
    cum = round2(cum + netto);
    return { mese: k, entrate: b.entrate, uscite: b.uscite, netto: netto, cumulato: cum };
  });
}
function renderChartCashflow() {
  if (typeof Chart === 'undefined') return; // v2.22: vedi renderChart
  var ctx = document.getElementById('chartCashflow') ? document.getElementById('chartCashflow').getContext('2d') : null;
  if (!ctx) return;
  var sel = document.getElementById('cashflow-range');
  var monthsBack = sel ? parseInt(sel.value) : 12;
  var data = buildCashflowMonthly(monthsBack > 0 ? monthsBack : null);
  if (chartCashflow) chartCashflow.destroy();
  if (!data.length) return;
  chartCashflow = new Chart(ctx, {
    data: {
      labels: data.map(function(d) { return d.mese; }),
      datasets: [
        { type: 'bar', label: 'Entrate (€)', data: data.map(function(d) { return d.entrate; }), backgroundColor: '#16a34a', order: 2 },
        { type: 'bar', label: 'Uscite (€)', data: data.map(function(d) { return -d.uscite; }), backgroundColor: '#dc2626', order: 2 },
        { type: 'line', label: 'Flusso cumulato nel periodo (€)', data: data.map(function(d) { return d.cumulato; }), borderColor: '#2563eb', backgroundColor: '#2563eb', yAxisID: 'y1', tension: .25, pointRadius: 3, order: 1 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': € ' + fmt(Math.abs(ctx.raw)); } } } },
      scales: {
        x: { title: { display: true, text: 'Mese' } },
        y: { title: { display: true, text: 'Entrate / Uscite mensili (€)' }, ticks: { callback: function(v) { return '€ ' + fmt(v); } } },
        y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Flusso cumulato (€)' }, ticks: { callback: function(v) { return '€ ' + fmt(v); } } }
      }
    }
  });
}

// ======================== ALTRO ========================
function renderSummary() {
  var totAttive = round2(S.a.reduce(function(s, i) { return s + i.tot; }, 0));
  var residuoAttive = round2(S.a.reduce(function(s, i) { return s + residuo(i); }, 0));
  var totPassive = round2(S.p.reduce(function(s, i) { return s + i.tot; }, 0));
  var residuoPassive = round2(S.p.reduce(function(s, i) { return s + residuo(i); }, 0));
  var saldoNetto = round2(totAttive - totPassive);
  document.getElementById('sum-attive').textContent = '€ ' + fmt(totAttive);
  document.getElementById('sum-a-res').textContent = '€ ' + fmt(residuoAttive);
  document.getElementById('sum-passive').textContent = '€ ' + fmt(totPassive);
  document.getElementById('sum-p-res').textContent = '€ ' + fmt(residuoPassive);
  document.getElementById('sum-saldo').textContent = '€ ' + fmt(saldoNetto);
}
function updatePeriodSelectors() {
  var periods = new Set(), years = new Set();
  S.a.forEach(function(i) { if (i.data) { periods.add(i.data.slice(0, 7)); years.add(i.data.slice(0, 4)); } });
  S.p.forEach(function(i) { if (i.data) { periods.add(i.data.slice(0, 7)); years.add(i.data.slice(0, 4)); } });
  var sortedYears = Array.from(years).sort().reverse();
  var sortedPeriods = Array.from(periods).sort().reverse();
  var yearOpts = sortedYears.map(function(y) { return '<option value="y:' + y + '">📅 Anno ' + y + '</option>'; }).join('');
  var monthOpts = sortedPeriods.map(function(p) { return '<option value="' + p + '">' + p.replace('-', ' / ') + '</option>'; }).join('');
  var fullOpts = '<option value="all">Tutti i periodi</option>' +
    (yearOpts ? '<optgroup label="Anno">' + yearOpts + '</optgroup>' : '') +
    (monthOpts ? '<optgroup label="Mese">' + monthOpts + '</optgroup>' : '');
  ['period-a', 'period-p', 'period-arch-a', 'period-arch-p'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
      var cur = el.value;
      el.innerHTML = fullOpts;
      el.value = cur;
    }
  });
}
function addIvaLine(aliq, imp, iva) {
  if (aliq === undefined) aliq = 22;
  if (imp === undefined) imp = 0;
  if (iva === undefined) iva = 0;
  var container = document.getElementById('iva-lines');
  var line = document.createElement('div');
  line.className = 'iva-line';
  line.innerHTML = '<input type="number" class="finput iva-aliq" value="' + aliq + '" step="0.1" placeholder="%">' +
    '<input type="number" class="finput iva-imp" value="' + imp + '" step="0.01" placeholder="Imponibile" oninput="updateIvaTotals()">' +
    '<span class="iva-iva-display">€ ' + fmt(iva) + '</span>' +
    '<button class="ico" style="color:#dc2626" onclick="this.parentElement.remove(); updateIvaTotals();">🗑️</button>';
  container.appendChild(line);
  updateIvaTotals();
}
function updateIvaTotals() {
  var totImp = 0, totIva = 0;
  document.querySelectorAll('#iva-lines .iva-line').forEach(function(line) {
    var imp = parseFloat(line.querySelector('.iva-imp').value) || 0;
    var aliq = parseFloat(line.querySelector('.iva-aliq').value) || 0;
    var iva = round2(imp * aliq / 100);
    totImp += imp;
    totIva += iva;
    line.querySelector('.iva-iva-display').textContent = '€ ' + fmt(iva);
  });
  document.getElementById('ft-imp').textContent = '€ ' + fmt(totImp);
  document.getElementById('ft-iva').textContent = '€ ' + fmt(totIva);
  document.getElementById('ft-tot').textContent = '€ ' + fmt(totImp + totIva);
  // v2.23: netto effettivamente da incassare/pagare
  var nettoEl = document.getElementById('ft-netto');
  if (nettoEl) {
    var rit = Math.abs(parseFloat((document.getElementById('f-ritenuta') || { value: 0 }).value) || 0);
    var split = document.getElementById('f-split') && document.getElementById('f-split').checked ? Math.abs(totIva) : 0;
    nettoEl.textContent = '€ ' + fmt(Math.abs(totImp + totIva) - rit - split);
    var wrap = document.getElementById('ft-netto-wrap');
    if (wrap) wrap.style.display = (rit > 0 || split > 0) ? '' : 'none';
  }
}
// v2.23: scorciatoia — ritenuta come percentuale dell'imponibile (20% professionisti, 4% condomini...)
function setRitenutaPerc(perc) {
  var totImp = 0;
  document.querySelectorAll('#iva-lines .iva-line').forEach(function(line) { totImp += Math.abs(parseFloat(line.querySelector('.iva-imp').value) || 0); });
  document.getElementById('f-ritenuta').value = round2(totImp * perc / 100).toFixed(2);
  updateIvaTotals();
}
function toggleRemovePdf(btn) {
  var isRemove = btn.getAttribute('data-remove') === '1';
  if (isRemove) { btn.setAttribute('data-remove', '0'); btn.style.display = 'none'; }
  else { btn.setAttribute('data-remove', '1'); btn.style.display = 'inline-flex'; }
}
function acUpdate() {
  var input = document.getElementById('f-rs');
  var val = input.value.toLowerCase();
  var list = document.getElementById('ac-list');
  var matches = S.suppliers.filter(function(s) { return s.toLowerCase().includes(val); });
  if (matches.length && val) {
    list.innerHTML = matches.map(function(m) { return '<div class="ac-item" onclick="document.getElementById(\'f-rs\').value=\'' + jsq(m) + '\'; acHide();">' + esc(m) + '</div>'; }).join('');
    list.classList.add('open');
  } else {
    list.classList.remove('open');
  }
}
function acHide() { setTimeout(function() { document.getElementById('ac-list').classList.remove('open'); }, 200); }


// ======================== STORAGE ========================
var APP_VERSION = '2.23.0';
var DATA_FILE = 'data.json';
var ALLEGATI = 'allegati';
var HAS_DIR = 'showDirectoryPicker' in window;
var HAS_FILE = 'showOpenFilePicker' in window;
var STOR = HAS_DIR ? 'dir' : HAS_FILE ? 'file' : 'idb';
var _dir = null, _fh = null, _dirty = false, _saveTimer = null, _idb = null;

function openIDB() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise(function(res, rej) {
    var r = indexedDB.open('fmp_v2', 2);
    r.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('pdfs')) db.createObjectStore('pdfs');
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
    };
    r.onsuccess = function(e) { _idb = e.target.result; res(_idb); };
    r.onerror = function(e) { rej(e.target.error); };
  });
}
async function idbSet(store, key, val) {
  var db = await openIDB();
  return new Promise(function(res, rej) {
    var tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(val, key);
    tx.oncomplete = res;
    tx.onerror = function(e) { rej(e.target.error); };
  });
}
async function idbGetV(store, key) {
  var db = await openIDB();
  return new Promise(function(res, rej) {
    var tx = db.transaction(store, 'readonly');
    var r = tx.objectStore(store).get(key);
    r.onsuccess = function() { res(r.result || null); };
    r.onerror = function(e) { rej(e.target.error); };
  });
}
async function idbDel(store, key) {
  var db = await openIDB();
  return new Promise(function(res, rej) {
    var tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = res;
    tx.onerror = function(e) { rej(e.target.error); };
  });
}
async function idbAll(store) {
  var db = await openIDB();
  return new Promise(function(res, rej) {
    var tx = db.transaction(store, 'readonly');
    var out = {};
    var req = tx.objectStore(store).openCursor();
    req.onsuccess = function(e) {
      var c = e.target.result;
      if (c) { out[c.key] = c.value; c.continue(); }
      else res(out);
    };
    req.onerror = function(e) { rej(e.target.error); };
    tx.onerror = function(e) { rej(e.target.error); };
  });
}
function stateToJSON() {
  return JSON.stringify({
    _version: APP_VERSION, _saved: new Date().toISOString(),
    a: S.a.map(function(i) { var c = Object.assign({}, i); delete c.pdf; return c; }),
    p: S.p.map(function(i) { var c = Object.assign({}, i); delete c.pdf; return c; }),
    suppliers: S.suppliers, customMods: S.customMods || [], movimenti: S.movimenti || [],
    cassa: S.cassa, banche: S.banche, archive: S.archive, regoleChiusura: S.regoleChiusura || []
  }, null, 2);
}
function applyJSON(d) {
  if (!d) return;
  S.a = (d.a || []).map(function(i) { var c = Object.assign({}, i); delete c.pdf; return c; });
  S.p = (d.p || []).map(function(i) { var c = Object.assign({}, i); delete c.pdf; return c; });
  S.suppliers = d.suppliers || [];
  S.customMods = d.customMods || [];
  S.movimenti = d.movimenti || [];
  S.cassa = d.cassa || { saldo: 0, movimenti: [] };
  S.banche = d.banche || [];
  S.archive = d.archive || { docs: [], movimenti: [] };
  S.regoleChiusura = d.regoleChiusura || [];
  if (!S.cassa.movimenti) S.cassa.movimenti = [];
  _selectedArchiveDocsA.clear();
  _selectedArchiveDocsP.clear();
  _selectedArchiveMovs.clear();
}
async function openFolder() {
  try {
    if (STOR === 'dir') {
      _dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'fmp-data' });
      _fh = null;
      await loadData();
    } else if (STOR === 'file') {
      _fh = (await window.showOpenFilePicker({
        id: 'fmp-file',
        types: [{ description: 'Dati FattureManager', accept: { 'application/json': ['.json'] } }]
      }))[0];
      _dir = null;
      await loadData();
    } else {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async function(e) {
        var file = e.target.files[0];
        if (!file) return;
        try {
          var text = await file.text();
          var data = JSON.parse(text);
          applyJSON(data);
          await idbSet('data', 'main', JSON.stringify(data));
          _dirty = false; setSaveStatus('saved');
          updateFolderUI();
          refreshModSelects();
          initBanche();
          aggiornaSelectBanche();
          ['a', 'p'].forEach(function(t) { render(t); });
          renderMov();
          refreshCassa();
          renderArchiveDocs('a');
          renderArchiveDocs('p');
          renderArchiveMovs();
          toast('📂 Dati caricati da ' + file.name, 'success');
        } catch (err) {
          toast('❌ File JSON non valido', 'error');
        }
      };
      input.click();
      return;
    }
    updateFolderUI();
    refreshModSelects();
    initBanche();
    aggiornaSelectBanche();
    ['a', 'p'].forEach(function(t) { render(t); });
    renderMov();
    refreshCassa();
    renderArchiveDocs('a');
    renderArchiveDocs('p');
    renderArchiveMovs();
    var nome = (_dir || _fh) ? ' — ' + (_dir || _fh).name : '';
    toast('📂 Dati caricati' + nome, 'success');
    backupGiornalieroSeNecessario();
  } catch (e) {
    if (e.name !== 'AbortError') toast('❌ ' + e.message, 'error');
  }
}
async function newFolder() {
  try {
    if (STOR === 'dir') {
      _dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'fmp-data' });
      _fh = null;
    } else if (STOR === 'file') {
      _fh = await window.showSaveFilePicker({
        id: 'fmp-file',
        suggestedName: 'fatturemanager_dati.json',
        types: [{ description: 'Dati FattureManager', accept: { 'application/json': ['.json'] } }]
      });
      _dir = null;
    }
    S = { a: [], p: [], suppliers: [], customMods: [], movimenti: [], cassa: { saldo: 0, movimenti: [] }, banche: [], archive: { docs: [], movimenti: [] }, regoleChiusura: [] };
    initBanche();
    await saveData();
    updateFolderUI(); refreshModSelects(); aggiornaSelectBanche();
    ['a', 'p'].forEach(function(t) { render(t); }); renderMov(); refreshCassa();
    renderArchiveDocs('a'); renderArchiveDocs('p'); renderArchiveMovs();
    toast('✅ Nuovi dati creati' + ((_dir || _fh) ? ' — ' + (_dir || _fh).name : ''), 'success');
  } catch (e) { if (e.name !== 'AbortError') toast('❌ ' + e.message, 'error'); }
}
async function loadData() {
  try {
    var d = null;
    if (STOR === 'dir' && _dir) {
      var fh = await _dir.getFileHandle(DATA_FILE).catch(function() { return null; });
      if (fh) d = JSON.parse(await (await fh.getFile()).text());
    } else if (STOR === 'file' && _fh) {
      d = JSON.parse(await (await _fh.getFile()).text());
    } else {
      var raw = await idbGetV('data', 'main');
      d = raw ? JSON.parse(raw) : null;
    }
    if (d) {
      applyJSON(d);
    } else {
      S = { a: [], p: [], suppliers: [], customMods: [], movimenti: [], cassa: { saldo: 0, movimenti: [] }, banche: [], archive: { docs: [], movimenti: [] }, regoleChiusura: [] };
      initBanche();
    }
    _dirty = false;
    setSaveStatus('saved');
  } catch (err) {
    console.error('Errore loadData:', err);
    S = { a: [], p: [], suppliers: [], customMods: [], movimenti: [], cassa: { saldo: 0, movimenti: [] }, banche: [], archive: { docs: [], movimenti: [] }, regoleChiusura: [] };
    initBanche();
    _dirty = false;
    setSaveStatus('saved');
  }
}
async function saveData() {
  setSaveStatus('pending');
  var json = stateToJSON();
  try {
    if (STOR === 'dir' && _dir) {
      var fh = await _dir.getFileHandle(DATA_FILE, { create: true });
      var w = await fh.createWritable();
      await w.write(json);
      await w.close();
    } else if (STOR === 'file' && _fh) {
      var perm = await _fh.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        var req = await _fh.requestPermission({ mode: 'readwrite' });
        if (req !== 'granted') {
          setSaveStatus('error');
          toast('⚠️ Permesso scrittura negato — riclicca "💾 Salva ora"', 'warn');
          return;
        }
      }
      var w2 = await _fh.createWritable();
      await w2.write(json);
      await w2.close();
    } else {
      await idbSet('data', 'main', json);
    }
    _dirty = false; setSaveStatus('saved');
  } catch (e) { setSaveStatus('error'); toast('❌ Errore salvataggio: ' + e.message, 'error'); }
}
function save() { 
  _dirty = true; 
  setSaveStatus('pending'); 
  clearTimeout(_saveTimer); 
  _saveTimer = setTimeout(function() { saveData(); }, 800); 
  // v2.22: in try/catch — se localStorage è pieno o bloccato, save() non deve lanciare eccezioni
  // (interromperebbe a metà le operazioni che lo chiamano, prima del ridisegno delle tabelle).
  try {
    var saveCount = parseInt(localStorage.getItem('fmp_saveCount') || '0');
    localStorage.setItem('fmp_saveCount', (saveCount + 1) % 10);
    if ((saveCount + 1) % 10 === 0) backupAuto();
  } catch (e) { console.error('save (contatore backup):', e); }
}
async function manualSave() { clearTimeout(_saveTimer); await saveData(); toast('💾 Salvato', 'success'); }
// Un base64 di PDF valido, decodificato, inizia sempre con "%PDF-" — che in base64 corrisponde
// al prefisso "JVBERi0". Un file troncato (scrittura interrotta, es. chiavetta scollegata a metà)
// o un fallback finito nel posto sbagliato produce un payload che non supera questo controllo.
function isValidPdfDataURL(dataURL) {
  if (!dataURL || typeof dataURL !== 'string') return false;
  var idx = dataURL.indexOf(',');
  if (idx === -1) return false;
  var payload = dataURL.slice(idx + 1);
  return payload.length > 100 && payload.indexOf('JVBERi0') === 0;
}
// Ritorna { ok, location, error }. NON fallisce mai silenziosamente: se il salvataggio sulla
// cartella USB fallisce (permessi, chiavetta scollegata, scrittura interrotta...) lo dice
// esplicitamente al chiamante invece di far sparire il PDF in un fallback locale senza avviso —
// è così che un PDF può finire "salvato" solo nel browser di un PC e risultare introvabile/
// illeggibile aprendo l'archivio da un'altra postazione.
async function fsPdfPut(id, dataURL) {
  if (STOR === 'dir' && _dir) {
    try {
      var d = await _dir.getDirectoryHandle(ALLEGATI, { create: true });
      var fh = await d.getFileHandle(id + '.b64', { create: true });
      var w = await fh.createWritable();
      await w.write(dataURL);
      await w.close();
      // Verifica di lettura immediata: intercetta scritture interrotte che il browser non segnala.
      var check = await (await (await d.getFileHandle(id + '.b64')).getFile()).text();
      if (check.length !== dataURL.length || !isValidPdfDataURL(check)) {
        throw new Error('verifica post-scrittura fallita (file troncato o corrotto sulla chiavetta)');
      }
      return { ok: true, location: 'dir' };
    } catch (e) {
      console.error('fsPdfPut (USB):', e);
      try {
        await idbSet('pdfs', id, dataURL);
        return { ok: false, location: 'idb-fallback', error: e.message };
      } catch (e2) {
        return { ok: false, location: 'none', error: e2.message };
      }
    }
  }
  try {
    await idbSet('pdfs', id, dataURL);
    return { ok: true, location: 'idb' };
  } catch (e) {
    return { ok: false, location: 'none', error: e.message };
  }
}
async function fsPdfGet(id) {
  if (STOR === 'dir' && _dir) {
    try {
      var d = await _dir.getDirectoryHandle(ALLEGATI);
      return await (await (await d.getFileHandle(id + '.b64')).getFile()).text();
    } catch (e) {}
  }
  return await idbGetV('pdfs', id);
}
async function fsPdfDelete(id) {
  if (STOR === 'dir' && _dir) {
    try { var d = await _dir.getDirectoryHandle(ALLEGATI); await d.removeEntry(id + '.b64'); } catch (e) {}
  }
  await idbDel('pdfs', id);
}
async function fsPdfGetAll() {
  if (STOR === 'dir' && _dir) {
    try {
      var d = await _dir.getDirectoryHandle(ALLEGATI);
      var out = {};
      for await (var entry of d.entries()) {
        var n = entry[0], fh = entry[1];
        if (n.endsWith('.b64')) out[n.replace('.b64', '')] = await (await fh.getFile()).text();
      }
      return out;
    } catch (e) {}
  }
  return await idbAll('pdfs');
}
// Scansiona tutte le fatture (attive, passive, archiviate) marcate come "con PDF allegato" e
// verifica che il contenuto salvato sia davvero un PDF leggibile, non solo che esista un record.
async function auditPdfAttachments() {
  var problems = [];
  async function check(doc, type, archived) {
    if (!doc.hasPdf) return;
    var dataURL = null;
    try { dataURL = await fsPdfGet(doc.id); } catch (e) {}
    if (!isValidPdfDataURL(dataURL)) {
      problems.push({
        id: doc.id, type: type, archived: !!archived,
        rs: doc.rs, num: doc.num, data: doc.data, pdfName: doc.pdfName,
        reason: !dataURL ? 'file non trovato' : 'contenuto non valido o troncato'
      });
    }
  }
  for (var i = 0; i < S.a.length; i++) await check(S.a[i], 'a', false);
  for (var j = 0; j < S.p.length; j++) await check(S.p[j], 'p', false);
  if (S.archive && S.archive.docs) {
    for (var k = 0; k < S.archive.docs.length; k++) await check(S.archive.docs[k], S.archive.docs[k]._originalType, true);
  }
  return problems;
}
function updateFolderUI() {
  var fn = document.getElementById('folder-name');
  var fs = document.getElementById('folder-status');
  var handle = _dir || _fh;
  var ico = { dir: '📂', file: '📄', idb: '🗄️' }[STOR];
  if (fn) {
    if (handle) fn.textContent = ico + ' ' + handle.name;
    else if (STOR === 'idb') fn.textContent = '🗄️ Dati temporanei in sessione — usa "📤 Backup JSON" per salvare su file';
    else fn.textContent = '📂 Nessun file selezionato — clicca "Apri Dati"';
  }
  if (fs) fs.style.display = (handle || STOR === 'idb') ? 'flex' : 'none';
}
function setSaveStatus(s) {
  var el = document.getElementById('save-status');
  if (!el) return;
  var map = { saved: { t: '✓ Salvato', c: '#4ade80' }, pending: { t: '● Salvataggio…', c: '#fbbf24' }, error: { t: '✕ Errore', c: '#f87171' } };
  var v = map[s] || { t: '', c: 'transparent' };
  el.textContent = v.t;
  el.style.color = v.c;
}

// ======================== INIT ========================
function checkNetworkPathWarning() {
  try {
    var banner = document.getElementById('network-path-warning');
    if (!banner) return;
    // location.hostname è valorizzato solo per percorsi file:// con host di rete
    // (es. file://server/PUBBLICA/...), incluse le unità mappate: Chrome/Edge le
    // risolvono comunque alla forma UNC prima di generare l'URL. Un disco locale
    // (C:, D:, chiavetta USB) produce sempre hostname vuoto.
    var isNetworkPath = location.protocol === 'file:' && !!location.hostname;
    banner.style.display = isNetworkPath ? 'block' : 'none';
  } catch (e) { /* non bloccare l'avvio per questo controllo */ }
}
// v2.22: il salvataggio parte 800 ms dopo l'ultima modifica — avvisa se si chiude la pagina prima.
window.addEventListener('beforeunload', function(e) {
  if (_dirty) { e.preventDefault(); e.returnValue = ''; }
});
window.addEventListener('DOMContentLoaded', function() {
  checkNetworkPathWarning();
  loadPreferences();
  initBanche();
  if (STOR === 'idb') updateFolderUI();
  refreshModSelects();
  aggiornaSelectBanche();
  render('a'); render('p'); renderMov(); refreshCassa();
  renderArchiveDocs('a'); renderArchiveDocs('p'); renderArchiveMovs();
  renderChart();
  checkIntegrity();
  backupGiornalieroSeNecessario();
});