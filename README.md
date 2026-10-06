# Event Studio

Tool personale di Factory Studios / YEG! per impostare un evento: dal brief del cliente alla proposta,
al preventivo e ai fornitori da chiamare. Gira in locale sul Mac; l'AI è Qwen (Alibaba Model Studio).

```
Brief → Lacune → Concept → Scaletta → Sviluppo → Immagini → Preventivo → Fornitori → Controllo → Export
```

## Avvio

**Doppio clic su `Avvia Event Studio.command`**, nella cartella del progetto. Si apre il Terminale, parte tutto e dopo
qualche secondo il browser mostra l'app su **http://localhost:3100**. Per spegnere: chiudi la finestra del Terminale
o premi Ctrl+C. Se l'app è già accesa, il doppio clic apre solo il browser.

- La prima volta macOS può chiedere se il Terminale può accedere alla cartella Scrivania: consenti.
- Il file sceglie da solo Node 24 (quello di nvm, anche se sul Mac ce ne sono altri) e installa le dipendenze se mancano.
- L'app risponde solo da questo Mac (`127.0.0.1`), mai dalla rete locale: contiene brief riservati e non ha login.

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
   pronta (copia, mail, `.eml`), ricerca di nuovi fornitori online.
9. **Controllo**: pasti senza catering, notti e camere, pax, slot inesistenti, SIAE, compliance di settore, budget.
10. **Export**: PowerPoint modificabile, pagina web interattiva in un unico file (offline), proposta e preventivo in PDF,
    preventivo in Excel con formule (versione cliente e interna).

## Regole che il tool non viola

- **Mai telefoni inventati.** Un numero è "verificato" solo se compare nel testo del PDF o nella pagina del sito
  ufficiale scaricata dal tool (la copia resta in `data/evidence/`). Quelli letti con l'OCR restano "da verificare".
- **I conti li fa il codice**, non l'AI: preventivo, IVA, punteggi della commissione, controlli di coerenza.
- **Le decisioni restano a te**: brief confermato, concept scelto, preventivo rivisto.

## Regimi IVA

Configurabili in Impostazioni: 22%, 10% (alloggio, somministrazione, trasporto persone), 4%, **74-ter** (prezzo con IVA
non esposta, IVA a debito sul margine = margine × 22/122), **art. 15** (spese anticipate: nessun ricarico, fuori base
imponibile), esente, fuori campo. **Da validare con il commercialista prima di usarli su un preventivo reale.**

## Archivio dal Drive

La cartella "MVP SUPPLIERS" alimenta proposte passate, location e hotel, listino e rubrica fornitori.

```bash
npm run import:drive                    # prova a vuoto: cosa cambierebbe
npm run import:drive -- --apply --files # indice + PDF (con cache: un nuovo import non riscarica)
npm run import:drive -- --contacts      # ricalcola i contatti dai PDF archiviati
```

Lo stesso si fa da **Archivio → Import da Drive**, dove c'è anche l'OCR dei PDF fatti solo di immagini.
La cartella oggi è condivisa con chiunque abbia il link: conviene restringerla e indicare in Impostazioni il percorso
della copia sincronizzata con Google Drive per desktop.

## Comandi utili

```bash
npm test                         # test (motore del preventivo, IVA, import, contatti, coerenza)
npm run typecheck
npm run backup                   # copia del database in data/backups (ne tiene 20)
npx tsx scripts/demo-fill.ts     # progetto ESEMPIO con dati dimostrativi (--delete per toglierlo)
```

## Struttura

```
src/app/            pagine e API (Next.js)
src/ai/             Qwen: chiamate, schemi zod, contesto comune, modalità riservata
src/domain/         logica pura: preventivo, coerenza, contatti, import, documenti
src/exports/        PowerPoint, HTML, PDF, Excel
src/worker/         coda dei lavori AI e loro esecuzione
drizzle/            migrazioni del database (SQLite)
data/               database, PDF, immagini, export, prove (escluso da git)
docs/decisions.md   scelte tecniche e verifiche in sospeso
```

## Fase 2

Integrazione con event-bus e yeg-dashboard (l'evento confermato nasce con i KPI del piano di misurazione),
automatismi con n8n (sincronizzazione del Drive, invio delle richieste ai fornitori), uso di team (login Cognito,
Postgres, AWS).
