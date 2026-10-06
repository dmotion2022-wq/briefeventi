// Impostazioni predefinite. Vengono scritte nel database solo se mancano:
// da lì in poi si modificano dalla pagina Impostazioni.

export const MODEL_TIERS = ["max", "flash", "search", "ocr", "image_pro", "image"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

/** Prezzi in USD come pubblicati da Alibaba Model Studio (regione internazionale). */
export type ModelPrice = {
  inputPerMTok?: number;
  outputPerMTok?: number;
  cachedInputPerMTok?: number;
  /** USD ogni 1.000 chiamate (es. ricerca web) */
  perThousandCalls?: number;
  perImage?: number;
};

export type QuoteDefaults = {
  validityDays: number;
  agencyFeeBp: number;
  contingencyBp: number;
  contingencyMode: "internal" | "client_line";
  paymentTranches: { label: string; percentBp: number }[];
  notes: string[];
};

export type AgencyInfo = {
  name: string;
  brand: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  vatNumber: string;
};

export type DriveSource = {
  folderUrl: string;
  sheetId: string;
  gids: { works: string; location: string; budgets: string; attrezzatura: string };
  /** ID delle sottocartelle pubbliche da cui scaricare i PDF. */
  folders: { works: string; location: string; budgets: string; attrezzatura: string };
  localPath: string;
};

export const DEFAULT_SETTINGS = {
  // Nomi dei modelli per livello: verificati con `npm run spike -- models`.
  "ai.models": {
    max: "qwen3.8-max",
    flash: "qwen3.8-flash",
    search: "qwen3.7-plus",
    ocr: "qwen-vl-ocr",
    image_pro: "qwen-image-3.0-pro",
    image: "qwen-image-3.0",
  } satisfies Record<ModelTier, string>,
  "ai.prices": {} as Record<string, ModelPrice>,
  "ai.usdToEur": 0.86,
  "ai.thinking": { max: false } as Partial<Record<ModelTier, boolean>>,

  "quote.defaults": {
    validityDays: 30,
    agencyFeeBp: 0,
    contingencyBp: 500,
    contingencyMode: "internal",
    paymentTranches: [
      { label: "Acconto alla conferma", percentBp: 5000 },
      { label: "Saldo a fine evento", percentBp: 5000 },
    ],
    notes: [
      "Prezzi in euro, IVA esclusa salvo dove indicato.",
      "Disponibilità di location, hotel e fornitori da riconfermare alla conferma dell'incarico.",
      "Quantità e servizi calcolati sul numero di partecipanti indicato; variazioni saranno riquotate.",
    ],
  } satisfies QuoteDefaults,

  agency: {
    name: "YEG! Your Event Group",
    brand: "Factory Studios",
    contactName: "",
    email: "",
    phone: "",
    website: "",
    address: "",
    vatNumber: "",
  } satisfies AgencyInfo,

  // Vuota di proposito: il codice è pubblico e la cartella contiene prezzi e contatti dei fornitori.
  // Si imposta in Impostazioni → Archivio Drive incollando il link della cartella.
  "drive.source": {
    folderUrl: "",
    sheetId: "",
    gids: { works: "", location: "", budgets: "", attrezzatura: "" },
    folders: { works: "", location: "", budgets: "", attrezzatura: "" },
    localPath: "",
  } satisfies DriveSource,

  // Cliché da evitare: il generatore di concept li riceve come vincolo esplicito.
  "creative.cliches": [
    "ledwall con il video istituzionale come unico momento wow",
    "gadget generico con il logo",
    "caccia al tesoro standard come team building",
    "cena di gala in sala d'albergo senza un racconto",
    "keynote motivazionale generico",
    "photo booth come unica interazione",
    "spettacolo di droni o fuochi slegato dal messaggio",
    "app dell'evento senza un motivo reale per scaricarla",
    "palco con slide e podio come unico formato",
    "visita turistica guidata standard",
  ],

  // Regole di settore: promemoria per l'analisi e per il controllo di coerenza,
  // da verificare sempre con il compliance del cliente (niente soglie inventate).
  "compliance.sectors": {
    pharma: [
      "Ospitalità limitata al tempo strettamente necessario all'evento.",
      "Categoria hotel, ristorazione e tetti di spesa entro quanto previsto dal Codice Deontologico Farmindustria vigente: verificare con il cliente.",
      "Evitare località e periodi a prevalente richiamo turistico.",
      "Nessuna attività ricreativa o di intrattenimento per gli operatori sanitari.",
      "Prevalenza del programma scientifico; valutare accreditamento ECM e comunicazioni agli enti (AIFA) per i congressi.",
    ],
    medtech: [
      "Codice etico MedTech Europe: niente supporto diretto alla partecipazione degli operatori sanitari a eventi di terzi.",
      "Ospitalità ragionevole e secondaria rispetto al contenuto; location coerente con lo scopo professionale.",
    ],
    finance: [
      "Verificare le policy del cliente e dei partecipanti su omaggi e ospitalità (soglie di valore).",
      "Attenzione a conflitti di interesse e normativa anticorruzione; tracciabilità degli inviti.",
    ],
    automotive: [
      "Test drive e attività su strada o pista: assicurazioni, patenti, percorsi autorizzati e piano di sicurezza.",
    ],
    corporate: [],
    altro: [],
  } as Record<string, string[]>,
};

export type SettingsShape = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof SettingsShape;
