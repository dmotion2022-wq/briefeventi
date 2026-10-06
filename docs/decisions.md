# Decisioni tecniche

## Scelte

| Tema | Scelta | Perché |
|---|---|---|
| Uso | Sul Mac senza login; online su Vercel con accessi creati dall'amministratore | Prima solo locale (2026-10-02); dal 2026-10-06 anche online per gli utenti scelti da Emanuele |
| Framework | Next.js 16 (App Router), React 19, TypeScript strict, Node 24 | Stesso mondo di yeg-dashboard; Node 20 è a fine vita |
| Database | SQLite con Drizzle via libSQL: file `data/app.db` sul Mac, Turso online (`TURSO_DATABASE_URL`) | Stesso schema e stesse query nei due posti; Turso è nel Marketplace di Vercel. Il passaggio da better-sqlite3 ha reso asincrone tutte le chiamate al database (lint `no-floating-promises` per non perdere scritture) |
| Lavori AI | Sul Mac un worker separato con coda in `ai_runs`; online ogni lavoro parte in una funzione sua (`/api/runs/<id>/execute`, gettone monouso) e dopo la risposta lavora con `after()` | Online non c'è un processo sempre acceso. Limite di 300 s per esecuzione (vale su tutti i piani): i lavori lunghi restituiscono `continueLater` prima del limite e lo stesso run riparte. Un run senza battito da 90 s risulta interrotto; uno in coda da 20 s si rilancia |
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
| Repository pubblico | github.com/dmotion2022-wq/briefeventi con storia ripartita da un solo commit; la storia di sviluppo resta nel repository privato | Le versioni precedenti contenevano gli indirizzi della cartella Drive (condivisa con link, con prezzi e contatti dei fornitori). Il link ora si incolla in Impostazioni e foglio, schede e sottocartelle si ricavano da soli |
| Segreti online | Solo variabili d'ambiente del progetto Vercel; nell'app la chiave Qwen online si verifica ma non si scrive | Il codice è pubblico. Il primo amministratore nasce da `ADMIN_EMAIL`/`ADMIN_PASSWORD` solo se non ci sono utenti, con cambio password obbligatorio |
| Login | Email e password, scrypt (N=2^15), sessioni nel database (nel cookie solo il gettone, nel database il suo hash), cookie `__Host-` httpOnly, 30 giorni; blocco di 15 minuti dopo 5 errori; proxy che verifica la sessione più controllo in ogni azione e API | Pochi utenti scelti a mano: niente servizi esterni né registrazione libera. La sessione si revoca subito (cambio password, utente disattivato) |
| File online | Vercel Blob in modalità privata; nel database il percorso relativo, uguale al Mac | I brief sono riservati: i file si leggono solo attraverso l'app. I PDF caricati vanno dal browser all'archivio (le richieste alle funzioni hanno un limite di 4,5 MB) |
| PDF online | `@sparticuz/chromium` con Playwright | Nelle funzioni non c'è Chrome; sul Mac resta il Chrome installato |
| Piattaforme | Tabella `platforms` con 141 schede da una ricerca sui siti ufficiali (6 ottobre 2026), stato in uso / da valutare / scartata, collegate a ogni voce del preventivo e alla ricerca online | La cartella Drive non deve essere l'unica fonte di fornitori. Contatti solo pubblici e aziendali, con la pagina fonte, ricontrollati in automatico (93 email e 84 telefoni; quelli che non si ritrovano sono stati tolti) |

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

## Verifiche della versione online (2026-10-06, sul Mac in modalità online)

- [x] Login: 19 controlli automatici (primo amministratore dalle variabili, cambio obbligatorio, membro senza accesso a
      impostazioni e utenti, blocco dopo 5 errori, email doppia, link di ritorno solo interni, cookie httpOnly).
- [x] Lavoro diviso in tre esecuzioni: avvio da `/api/runs/<id>/execute`, ripresa e fine dello stesso run.
- [x] API senza sessione: 401; avvio di un lavoro senza gettone o con gettone sbagliato: 409.
- [x] Copia del database del Mac verso un database di prova (`scripts/copy-to-cloud.ts`): righe identiche, seconda copia rifiutata.
- [ ] Su Vercel: Turso, Blob privato, Chromium per i PDF e durata delle funzioni da provare al primo deploy.

## Note

- `npm audit`: segnalazioni su esbuild (solo drizzle-kit, sviluppo), image-size (pptxgenjs, solo immagini nostre),
  uuid (exceljs, uso non vulnerabile). Non forzato l'aggiornamento: introdurrebbe versioni incompatibili.
- PDF.js: si usa la build `legacy` perché quella moderna richiede API JavaScript non ancora presenti in Node 24.
- L'indice "Executive Summary" del Drive ha alcune righe imprecise (nomi presi dal file, una brochure di Genova segnata
  come Porto): la scheda va corretta a mano o con la lettura AI dei PDF.
