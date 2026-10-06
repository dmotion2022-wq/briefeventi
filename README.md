# Event Studio

Tool di Factory Studios / YEG! per impostare un evento: dal brief del cliente alla proposta, al preventivo e ai
fornitori da chiamare. Gira in locale sul Mac (senza login) oppure online su Vercel, con gli accessi creati
dall'amministratore. L'AI è Qwen (Alibaba Model Studio).

```
Brief → Lacune → Concept → Scaletta → Sviluppo → Immagini → Preventivo → Fornitori → Controllo → Export
```

## Avvio

**Doppio clic su `Avvia Event Studio.command`**, nella cartella del progetto. Si apre il Terminale, parte tutto e dopo
qualche secondo il browser mostra l'app su **http://localhost:3100**. Per spegnere: chiudi la finestra del Terminale
o premi Ctrl+C. Se l'app è già accesa, il doppio clic apre solo il browser.

- La prima volta macOS può chiedere se il Terminale può accedere alla cartella Scrivania: consenti.
- Il file sceglie da solo Node 24 (quello di nvm, anche se sul Mac ce ne sono altri) e installa le dipendenze se mancano.
- L'app risponde solo da questo Mac (`127.0.0.1`), mai dalla rete locale: contiene brief riservati e sul Mac non ha login.

Da terminale, nella cartella del progetto (serve Node 24, `.nvmrc`; per i PDF anche Google Chrome):

```bash
npm install     # solo la prima volta
npm run dev     # interfaccia + worker su http://localhost:3100 (altra porta: PORT=3200 npm run dev)
```

`npm run dev` avvia insieme l'interfaccia e il **worker**, il processo che esegue i lavori AI lunghi
(analisi, concept, moduli, ricerca fornitori, immagini, OCR). Al primo avvio crea il database in `data/`.

### La chiave Qwen

In **Impostazioni → Chiave Qwen** incolla la chiave e premi *Salva e verifica*. Vale subito, senza riavviare, anche per
il worker. La prova dice se Alibaba la rifiuta (chiave sbagliata o della regione Cina) e se qualche nome di modello
non compare nell'elenco. La home mostra un avviso finché la chiave manca.

La chiave finisce in `.env.local` (escluso da git, permessi 600): è un file nascosto, in Finder si mostra con
Cmd+Maiusc+punto. Si può anche scrivere a mano:

```
DASHSCOPE_API_KEY=sk-...
DASHSCOPE_BASE_URL=https://dashscope-intl.aliyuncs.com
```

Poi le prove sulle API, da terminale (costano pochi centesimi):

```bash
npm run spike -- models     # modelli disponibili sulla chiave
npm run spike -- all        # json_schema, thinking, ricerca con fonti, OCR, Qwen-Image
```

I nomi dei modelli e i prezzi per il contatore dei costi si impostano in **Impostazioni → Modelli e prezzi**.
Online la chiave non si incolla nell'app: sta nelle variabili d'ambiente di Vercel (vedi sotto).

## Come si usa

1. **Nuovo progetto**: incolla il brief o carica PDF/DOCX/email della gara. Con la *modalità riservata* il nome
   del cliente e i termini indicati diventano segnaposto prima dell'invio a Qwen.
2. **Brief**: dati estratti con la citazione della fonte, controllata sul testo ("non ritrovata" = da verificare).
   Correggi e conferma.
3. **Lacune**: ogni voce della checklist (21, più quelle di settore) è nel brief, dedotta con un'ipotesi o mancante,
   con la domanda da fare al cliente e la bozza di email.
4. **Concept**: tre direzioni (sicura, audace, dirompente) costruite sulla libreria dei format e sulle proposte passate,
   valutate da una "commissione di gara" sui criteri del bando. Scegli (anche fondendo) e nasce la **concept bible**.
5. **Scaletta** e **Sviluppo**: la scaletta è la spina dorsale; i sei moduli (location e sale, pernottamento, catering,
   grafica, interazione, produzione) si agganciano ai suoi slot e producono le voci di costo con una forchetta di stima.
6. **Immagini**: key visual e moodboard con Qwen-Image, palette e tono della bible applicati.
7. **Preventivo**: generato dai componenti o scritto a mano. Ogni voce è modificabile: modello di prezzo
   (unità, persona, forfait, pacchetto, percentuale), costo netto o lordo, ricarico, prezzo forzato, regime IVA,
   opzionale. Totali in tempo reale, vista interna (costi e margine) e cliente, revisioni, blocco all'invio.
8. **Fornitori**: per ogni voce i fornitori da chiamare, con telefono cliccabile e fonte, stato del contatto, registro
   delle chiamate, prezzo del fornitore ("usa nel preventivo" aggiorna la voce e il listino), richiesta di preventivo
   pronta (copia, mail, `.eml`), ricerca di nuovi fornitori online. Sotto ogni voce, **Dove cercare**: le piattaforme
   della sua categoria (prima quelle in uso), con la ricerca già impostata su servizio e città quando il sito lo
   permette; un fornitore trovato lì si aggiunge con la piattaforma come fonte.
9. **Controllo**: pasti senza catering, notti e camere, pax, slot inesistenti, SIAE, compliance di settore, budget.
10. **Export**: PowerPoint modificabile, pagina web interattiva in un unico file (offline), proposta e preventivo in PDF,
    preventivo in Excel con formule (versione cliente e interna).

## Piattaforme

**Archivio → Piattaforme** è l'elenco di dove cercare fornitori nuovi, categoria per categoria: marketplace, elenchi,
associazioni di categoria, convention bureau, portali ufficiali (SIAE, SUAP, AGENAS) e fornitori nazionali. Ogni scheda
dice a cosa serve, come si usa, quanto costa a chi organizza, la copertura e i contatti pubblici della piattaforma con
la pagina da cui vengono. Si segnano quelle che il team usa ("in uso"): sono le prime proposte nei progetti e guidano
anche la ricerca online dei fornitori. Le 141 schede di partenza vengono da una ricerca del 6 ottobre 2026
(`src/db/platforms-seed.ts`); si possono aggiungere le proprie. Quelle della ricerca non si eliminano, si scartano.

## Regole che il tool non viola

- **Mai telefoni inventati.** Un numero è "verificato" solo se compare nel testo del PDF o nella pagina del sito
  ufficiale scaricata dal tool (la copia resta nell'archivio, `evidence/`). Quelli letti con l'OCR o scritti a mano
  restano "da verificare" finché non si conferma chiamando. I contatti delle piattaforme sono stati ricontrollati tutti
  sulla pagina indicata come fonte.
- **I conti li fa il codice**, non l'AI: preventivo, IVA, punteggi della commissione, controlli di coerenza.
- **Le decisioni restano a te**: brief confermato, concept scelto, preventivo rivisto.

## Regimi IVA

Configurabili in Impostazioni: 22%, 10% (alloggio, somministrazione, trasporto persone), 4%, **74-ter** (prezzo con IVA
non esposta, IVA a debito sul margine = margine × 22/122), **art. 15** (spese anticipate: nessun ricarico, fuori base
imponibile), esente, fuori campo. **Da validare con il commercialista prima di usarli su un preventivo reale.**

## Archivio dal Drive

La cartella "MVP SUPPLIERS" alimenta proposte passate, location e hotel, listino e rubrica fornitori. Il suo link non
è nel codice (il repository è pubblico): si incolla in **Impostazioni → Archivio Drive** e foglio, schede e
sottocartelle si trovano da soli.

```bash
npm run import:drive                    # prova a vuoto: cosa cambierebbe
npm run import:drive -- --apply --files # indice + PDF (con cache: un nuovo import non riscarica)
npm run import:drive -- --contacts      # ricalcola i contatti dai PDF archiviati
```

Lo stesso si fa da **Archivio → Import da Drive**, dove c'è anche l'OCR dei PDF fatti solo di immagini.
La cartella oggi è condivisa con chiunque abbia il link e contiene prezzi e contatti dei fornitori: conviene
restringerla. Sul Mac basta indicare in Impostazioni la copia sincronizzata con Google Drive per desktop; online
l'import dal Drive richiede la cartella condivisa con link.

## Versione online (Vercel)

La stessa app, pubblicata dal repository GitHub su Vercel:

- **Accesso**: login con email e password. Gli utenti li crea l'amministratore in **Impostazioni → Utenti** (password
  temporanea da comunicare in privato, cambio obbligatorio al primo accesso). Due ruoli: amministratore (anche utenti e
  impostazioni) e membro del team. Sessioni di 30 giorni, blocco di 15 minuti dopo 5 password sbagliate.
- **Database**: Turso (lo stesso SQLite, in cloud; migrazioni automatiche). **File**: archivio Vercel Blob privato,
  letti solo attraverso l'app; i PDF caricati vanno dal browser direttamente all'archivio.
- **Lavori AI**: ognuno parte in una funzione sua (massimo 5 minuti per esecuzione su ogni piano Vercel); quelli lunghi
  (moduli, import, OCR, immagini, valutazione dei concept) si salvano a metà e ripartono da soli.
- **PDF**: Chromium per funzioni serverless al posto del Chrome del Mac.

Nessun segreto nel codice: chiavi e password stanno nelle variabili d'ambiente del progetto Vercel.

| Variabile | Cosa | Chi la imposta |
|---|---|---|
| `DASHSCOPE_API_KEY` | chiave Qwen (regione internazionale) | tu, "Sensitive" |
| `DASHSCOPE_BASE_URL` | `https://dashscope-intl.aliyuncs.com` (facoltativa) | tu |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | primo amministratore: valgono solo finché non esiste nessun utente, poi la password va cambiata | tu, "Sensitive" |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | database | l'integrazione Turso del Marketplace |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID` | archivio file (privato) | il Blob store collegato al progetto |

Passi: importa il repository in Vercel → *Storage* → crea un database **Turso** e un **Blob store privato** e collegali al
progetto → aggiungi le variabili sopra → *Deploy*. Regione delle funzioni: Francoforte (`vercel.json`).
Il piano Hobby di Vercel è solo per uso personale non commerciale: per l'agenzia serve Pro.

Per portare online archivio e progetti del Mac (righe del database e file), con le variabili del progetto in un file:

```bash
npx tsx scripts/copy-to-cloud.ts --env .env.cloud           # prova: cosa copierebbe
npx tsx scripts/copy-to-cloud.ts --env .env.cloud --apply   # copia (solo se online non ci sono ancora dati)
```

## Comandi utili

```bash
npm test                         # test (motore del preventivo, IVA, import, contatti, coerenza)
npm run typecheck
npm run backup                   # copia del database del Mac in data/backups (ne tiene 20)
npm run db:migrate               # migrazioni sul database Turso (su Vercel le lancia vercel-build)
npx tsx scripts/demo-fill.ts     # progetto ESEMPIO con dati dimostrativi (--delete per toglierlo)
```

## Struttura

```
src/app/            pagine e API (Next.js)
src/auth/           login, sessioni e password (versione online)
src/ai/             Qwen: chiamate, schemi zod, contesto comune, modalità riservata
src/domain/         logica pura: preventivo, coerenza, contatti, import, documenti
src/exports/        PowerPoint, HTML, PDF, Excel
src/worker/         coda dei lavori AI e loro esecuzione (worker sul Mac, funzioni in cloud)
src/lib/storage.ts  file: cartella data/ sul Mac, Vercel Blob online
drizzle/            migrazioni del database (SQLite/libSQL)
data/               database, PDF, immagini, export, prove sul Mac (escluso da git)
docs/decisions.md   scelte tecniche e verifiche in sospeso
```

## Fase 2

Integrazione con event-bus e yeg-dashboard (l'evento confermato nasce con i KPI del piano di misurazione),
automatismi con n8n (sincronizzazione del Drive, invio delle richieste ai fornitori), import dal Drive con un account di
servizio Google (cartella non più pubblica).
