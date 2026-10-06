# Decisioni tecniche

## Scelte

| Tema | Scelta | Perché |
|---|---|---|
| Uso | Personale, locale, senza login | Decisione di Emanuele (2026-10-02); il team arriva in fase 2 |
| Framework | Next.js 16 (App Router), React 19, TypeScript strict, Node 24 | Stesso mondo di yeg-dashboard; Node 20 è a fine vita |
| Database | SQLite (better-sqlite3, WAL) con Drizzle | Un file, zero installazioni; importi in centesimi e % in punti base: il passaggio a Postgres è un cambio di schema |
| Lavori AI | Processo worker separato, coda in `ai_runs` | Le generazioni durano minuti: niente timeout delle richieste né perdite al ricaricamento di Next |
| AI | Tutto su Qwen (DashScope, regione internazionale) | Decisione di Emanuele; il resto del codice usa solo `generateObject`, un adapter Claude non toccherebbe altro |
| Output strutturato | `json_schema` strict + validazione zod + un tentativo di riparazione; ripiego su `json_object` se il modello non accetta lo schema | Dati sempre validi per preventivo e moduli |
| Coerenza | Prefisso di contesto identico per ogni fase; enum dinamici per ID di slot, format, proposte e location | Il modello non può citare riferimenti inesistenti; la cache di contesto lavora |
| Telefoni | Solo se compaiono nella fonte (PDF o pagina del sito salvata); regex + libphonenumber con etichetta obbligatoria | Mai numeri inventati; partite IVA, fax e tabelle scartati (test) |
| Conti | Motore del preventivo puro, testato su un caso calcolato a mano | IVA, 74-ter, art. 15, fee, imprevisti, tranche al centesimo |
| Export | pptxgenjs, HTML in un file (font e immagini incorporati), Playwright sul Chrome installato, exceljs con formule | Modificabile, offline, numeri identici in tutti i formati |
| Avvio | `Avvia Event Studio.command` (doppio clic): sceglie il Node 24 di nvm, installa le dipendenze se mancano, apre il browser. Porta 3100 solo su 127.0.0.1, `proxy.ts` rifiuta host diversi da localhost | Next ascolta per default su tutte le interfacce: con brief riservati e senza login l'app non deve essere raggiungibile dalla rete locale (né via DNS rebinding). Sul Mac ci sono più Node (nvm 24, Homebrew rotto, uno vecchio 22) e il Terminale poteva sceglierne uno sbagliato |
| Chiamate AI | Sempre in streaming, `enable_thinking` esplicito, avanzamento nella barra ("Qwen scrive: N caratteri") e chiusura dopo 2 minuti di silenzio | Una chiamata lunga senza segnali sembra bloccata; un modello muto deve dare un errore chiaro, non un'attesa infinita |
| Schema per Qwen | Il convertitore toglie le parole chiave non supportate solo dove sono parole chiave, mai dai nomi dei campi (test su tutti gli schemi) | Toglieva il campo `format` del brief e delle applicazioni grafiche: ogni analisi del brief falliva la validazione |
| Chiave Qwen | Si incolla in Impostazioni; scritta in `.env.local` (permessi 600, scrittura atomica) e riletta a ogni chiamata da web e worker | `.env.local` è nascosto in Finder; così la chiave vale subito senza riavviare (provato: un worker già avviato la usa alla chiamata successiva). Il file ha la precedenza su `process.env` |

## Verifiche con la chiave (npm run spike, 2026-10-02)

- [x] Nomi dei modelli: `qwen3.8-max`, `qwen3.8-flash`, `qwen3.7-plus`, `qwen-image-3.0-pro`, `qwen-image-3.0` sono
      nell'elenco (172 modelli). `qwen-vl-ocr` non compare ma risponde (esiste anche `qwen-vl-ocr-2025-11-20`).
- [x] **I Qwen3.x ragionano per impostazione predefinita** anche senza `enable_thinking`: estrazione JSON minima in
      16,6 s (436 token di ragionamento su 519) contro 2,2 s con `enable_thinking: false`, stesso risultato. Era la
      causa dell'analisi del brief "ferma al 15%". Ora il parametro si manda sempre in modo esplicito.
- [x] `json_schema` strict su max e flash funziona, anche in streaming (primo testo in meno di 1 s).
- [x] Thinking in streaming sul modello max.
- [x] OCR con `qwen-vl-ocr`: telefono di prova letto correttamente.
- [x] Elenco modelli `GET /compatible-mode/v1/models`: è quello usato dal pulsante *Verifica* di Impostazioni.
- [x] Ricerca con fonti: `qwen3.7-plus` è multimodale e sull'API nativa va chiamato su `multimodal-generation`
      (su `text-generation` risponde "url error"); il codice ora ripiega da solo. **Qualità scarsa**: 0–1 fonti per
      ricerca con le strategie predefinita e `max`, anche quando il testo elenca fornitori (nomi presumibilmente dalla
      memoria del modello: i telefoni restano non verificati finché non si ritrovano sul sito). `agent` richiede
      ragionamento e streaming. Da migliorare.
- [ ] Qwen-Image 3.0 via API sincrona `multimodal-generation`, dimensioni `1664*928` e `1328*1328`
- [ ] Prezzi per modello da inserire in Impostazioni: senza, il contatore dei costi segna 0
- [x] Brief reale (Allegato A, 10 pagine): analisi in 52 s, 5.425 + 2.629 token, 7 citazioni su 9 ritrovate nel PDF
      (le altre 2 citano i dati del progetto inseriti a mano, non il documento).

## Note

- `npm audit`: segnalazioni su esbuild (solo drizzle-kit, sviluppo), image-size (pptxgenjs, solo immagini nostre),
  uuid (exceljs, uso non vulnerabile). Non forzato l'aggiornamento: introdurrebbe versioni incompatibili.
- PDF.js: si usa la build `legacy` perché quella moderna richiede API JavaScript non ancora presenti in Node 24.
- L'indice "Executive Summary" del Drive ha alcune righe imprecise (nomi presi dal file, una brochure di Genova segnata
  come Porto): la scheda va corretta a mano o con la lettura AI dei PDF.
