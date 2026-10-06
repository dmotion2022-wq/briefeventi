import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Convenzioni (portabili su Postgres in fase 2):
// - ID testuali con prefisso (prj_…), date in ISO 8601 come testo
// - importi in centesimi interi (*Cents), percentuali in punti base (*Bp: 1% = 100)
// - colonne JSON tipizzate con $type<…>() e validate con zod ai confini

const now = () => new Date().toISOString();
const createdAt = () => text("created_at").notNull().$defaultFn(now);
const updatedAt = () => text("updated_at").notNull().$defaultFn(now).$onUpdateFn(now);
const flag = (name: string) => integer(name, { mode: "boolean" }).notNull().default(false);

// ── Enumerazioni condivise (riusate da zod e dall'interfaccia) ─────────────────

export const SECTORS = ["pharma", "medtech", "finance", "automotive", "corporate", "altro"] as const;
export const PROJECT_STATUSES = [
  "brief",
  "analisi",
  "concept",
  "sviluppo",
  "preventivo",
  "inviata",
  "vinta",
  "persa",
  "archiviata",
] as const;
export const DOCUMENT_KINDS = [
  "brief",
  "tender",
  "email",
  "attachment",
  "venue_brochure",
  "supplier_quote",
  "past_work",
  "other",
] as const;
export const GAP_STATUSES = ["specified", "implied", "missing", "not_applicable"] as const;
export const CRITICALITIES = ["blocking", "important", "optional"] as const;
export const CONCEPT_VARIANTS = ["safe", "bold", "disruptive", "merged", "custom"] as const;
export const SLOT_KINDS = [
  "registration",
  "plenary",
  "breakout",
  "coffee",
  "lunch",
  "dinner",
  "gala",
  "transfer",
  "activity",
  "networking",
  "free",
  "other",
] as const;
export const MODULE_KINDS = [
  "venue",
  "accommodation",
  "catering",
  "graphic",
  "engagement",
  "production",
] as const;
export const PRICING_MODELS = ["unit", "per_pax", "forfait", "package", "percent"] as const;
export const PERIOD_UNITS = ["none", "hour", "day", "night"] as const;
export const COST_SOURCES = ["benchmark", "ai_estimate", "supplier_quote", "manual"] as const;
export const VAT_KINDS = ["standard", "margin_74ter", "art15", "exempt", "out_of_scope"] as const;
export const SUPPLIER_KINDS = [
  "venue",
  "hotel",
  "dmc",
  "catering",
  "av",
  "staging",
  "transport",
  "staff",
  "entertainment",
  "print",
  "gadget",
  "experience",
  "other",
] as const;
export const CONTACT_TYPES = ["phone", "mobile", "email", "whatsapp", "website"] as const;
export const CONTACT_STATUSES = ["verified", "to_verify", "invalid"] as const;
export const LINK_STATUSES = [
  "to_contact",
  "contacted",
  "quote_received",
  "confirmed",
  "discarded",
] as const;
export const RUN_STATUSES = [
  "queued",
  "running",
  "done",
  "failed",
  "cancelled",
  "interrupted",
] as const;

// ── Progetti e documenti ─────────────────────────────────────────────────────

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  clientName: text("client_name").notNull(),
  sector: text("sector", { enum: SECTORS }).notNull().default("corporate"),
  eventType: text("event_type"),
  status: text("status", { enum: PROJECT_STATUSES }).notNull().default("brief"),
  city: text("city"),
  region: text("region"),
  country: text("country").default("IT"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  paxMin: integer("pax_min"),
  paxTarget: integer("pax_target"),
  paxMax: integer("pax_max"),
  budgetCents: integer("budget_cents"),
  budgetNote: text("budget_note"),
  isTender: flag("is_tender"),
  tenderDeadline: text("tender_deadline"),
  confidential: flag("confidential"),
  confidentialTerms: text("confidential_terms", { mode: "json" }).$type<string[]>(),
  selectedConceptId: text("selected_concept_id"),
  outcome: text("outcome", { mode: "json" }).$type<{
    result: "vinta" | "persa" | "ritirata";
    score?: string;
    feedback?: string;
  }>(),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: DOCUMENT_KINDS }).notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    sha256: text("sha256").notNull(),
    path: text("path").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    pageCount: integer("page_count"),
    extractionStatus: text("extraction_status", {
      enum: ["pending", "done", "ocr_needed", "failed"],
    })
      .notNull()
      .default("pending"),
    driveFileId: text("drive_file_id"),
    sourceUrl: text("source_url"),
    createdAt: createdAt(),
  },
  (t) => [index("documents_project_idx").on(t.projectId), index("documents_sha_idx").on(t.sha256)],
);

export const documentPages = sqliteTable(
  "document_pages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    text: text("text").notNull().default(""),
    textSource: text("text_source", { enum: ["text_layer", "ocr", "none"] }).notNull(),
  },
  (t) => [uniqueIndex("document_pages_doc_page_idx").on(t.documentId, t.pageNumber)],
);

// ── Brief, lacune, concept ───────────────────────────────────────────────────

export const briefs = sqliteTable("briefs", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  status: text("status", { enum: ["draft", "confirmed"] }).notNull().default("draft"),
  data: text("data", { mode: "json" }).notNull().$type<Record<string, unknown>>(),
  // esito dell'analisi delle lacune: prontezza e bozza di email di domande al cliente
  analysis: text("analysis", { mode: "json" }).$type<{
    readiness: string;
    clientEmail: { subject: string; body: string };
    analyzedAt: string;
  }>(),
  runId: text("run_id"),
  createdAt: createdAt(),
  confirmedAt: text("confirmed_at"),
});

export const checklistItems = sqliteTable("checklist_items", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  description: text("description").notNull(),
  defaultSection: text("default_section").notNull(),
  defaultVatRegime: text("default_vat_regime").notNull().default("IVA22"),
  defaultMarkupBp: integer("default_markup_bp").notNull().default(1500),
  sectors: text("sectors", { mode: "json" }).$type<string[] | null>(),
  position: integer("position").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const gapItems = sqliteTable(
  "gap_items",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    briefId: text("brief_id")
      .notNull()
      .references(() => briefs.id, { onDelete: "cascade" }),
    checklistKey: text("checklist_key").notNull(),
    status: text("status", { enum: GAP_STATUSES }).notNull(),
    criticality: text("criticality", { enum: CRITICALITIES }).notNull(),
    summary: text("summary").notNull(),
    evidence: text("evidence", { mode: "json" }).$type<{ quote: string; page?: number; verified: boolean }[]>(),
    assumption: text("assumption"),
    question: text("question"),
    answer: text("answer"),
    assumptionAccepted: flag("assumption_accepted"),
    updatedAt: updatedAt(),
  },
  (t) => [index("gap_items_project_idx").on(t.projectId)],
);

export const concepts = sqliteTable("concepts", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  variant: text("variant", { enum: CONCEPT_VARIANTS }).notNull(),
  data: text("data", { mode: "json" }).notNull().$type<Record<string, unknown>>(),
  critique: text("critique", { mode: "json" }).$type<Record<string, unknown>>(),
  scoreBp: integer("score_bp"),
  status: text("status", { enum: ["proposed", "selected", "discarded"] }).notNull().default("proposed"),
  runId: text("run_id"),
  createdAt: createdAt(),
});

export const conceptBibles = sqliteTable("concept_bibles", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  conceptId: text("concept_id").references(() => concepts.id, { onDelete: "set null" }),
  version: integer("version").notNull(),
  data: text("data", { mode: "json" }).notNull().$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});

// ── Scaletta, moduli, componenti ─────────────────────────────────────────────

export const agendaSlots = sqliteTable(
  "agenda_slots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    date: text("date"),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    kind: text("kind", { enum: SLOT_KINDS }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    room: text("room"),
    pax: integer("pax"),
    narrativeBeat: text("narrative_beat"),
    position: integer("position").notNull(),
  },
  (t) => [index("agenda_slots_project_idx").on(t.projectId)],
);

export const modules = sqliteTable(
  "modules",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: MODULE_KINDS }).notNull(),
    data: text("data", { mode: "json" }).notNull().$type<Record<string, unknown>>(),
    status: text("status", { enum: ["draft", "edited", "locked"] }).notNull().default("draft"),
    builtFrom: text("built_from", { mode: "json" }).$type<Record<string, number>>(),
    runId: text("run_id"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("modules_project_kind_idx").on(t.projectId, t.kind)],
);

export const components = sqliteTable(
  "components",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    moduleId: text("module_id").references(() => modules.id, { onDelete: "set null" }),
    category: text("category").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    specs: text("specs", { mode: "json" }).$type<Record<string, unknown>>(),
    slotIds: text("slot_ids", { mode: "json" }).$type<string[]>(),
    quantityHint: real("quantity_hint"),
    unitHint: text("unit_hint"),
    periodsHint: real("periods_hint"),
    pricingModelHint: text("pricing_model_hint", { enum: PRICING_MODELS }),
    optional: flag("optional"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("components_project_idx").on(t.projectId)],
);

// ── Preventivo ───────────────────────────────────────────────────────────────

export const vatRegimes = sqliteTable("vat_regimes", {
  code: text("code").primaryKey(),
  label: text("label").notNull(),
  kind: text("kind", { enum: VAT_KINDS }).notNull(),
  rateBp: integer("rate_bp").notNull(),
  invoiceNote: text("invoice_note"),
  allowMarkup: integer("allow_markup", { mode: "boolean" }).notNull().default(true),
  position: integer("position").notNull(),
});

export type PaymentTranche = { label: string; percentBp: number };

export const quotes = sqliteTable(
  "quotes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    revision: integer("revision").notNull().default(1),
    status: text("status", { enum: ["draft", "sent", "accepted", "rejected", "superseded"] })
      .notNull()
      .default("draft"),
    title: text("title").notNull(),
    date: text("date").notNull(),
    validityDays: integer("validity_days").notNull().default(30),
    agencyFeeBp: integer("agency_fee_bp").notNull().default(0),
    agencyFeeVatRegime: text("agency_fee_vat_regime").notNull().default("IVA22"),
    contingencyBp: integer("contingency_bp").notNull().default(0),
    contingencyMode: text("contingency_mode", { enum: ["internal", "client_line"] })
      .notNull()
      .default("internal"),
    rounding: text("rounding", { enum: ["none", "unit_1", "unit_10"] }).notNull().default("none"),
    paymentTranches: text("payment_tranches", { mode: "json" }).$type<PaymentTranche[]>(),
    notes: text("notes", { mode: "json" }).$type<string[]>(),
    snapshot: text("snapshot", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    sentAt: text("sent_at"),
  },
  (t) => [uniqueIndex("quotes_number_rev_idx").on(t.number, t.revision)],
);

export const quoteSections = sqliteTable("quote_sections", {
  id: text("id").primaryKey(),
  quoteId: text("quote_id")
    .notNull()
    .references(() => quotes.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  optional: flag("optional"),
});

export const quoteLines = sqliteTable(
  "quote_lines",
  {
    id: text("id").primaryKey(),
    quoteId: text("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    sectionId: text("section_id")
      .notNull()
      .references(() => quoteSections.id, { onDelete: "cascade" }),
    componentId: text("component_id").references(() => components.id, { onDelete: "set null" }),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    detail: text("detail"),
    quantity: real("quantity").notNull().default(1),
    unit: text("unit").notNull().default("n."),
    periods: real("periods").notNull().default(1),
    periodUnit: text("period_unit", { enum: PERIOD_UNITS }).notNull().default("none"),
    pricingModel: text("pricing_model", { enum: PRICING_MODELS }).notNull().default("unit"),
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    fixedCostCents: integer("fixed_cost_cents").notNull().default(0),
    includedQuantity: real("included_quantity"),
    extraUnitCostCents: integer("extra_unit_cost_cents"),
    percentBp: integer("percent_bp"),
    percentOfLineIds: text("percent_of_line_ids", { mode: "json" }).$type<string[]>(),
    costIncludesVat: flag("cost_includes_vat"),
    supplierVatRateBp: integer("supplier_vat_rate_bp").notNull().default(2200),
    markupBp: integer("markup_bp").notNull().default(0),
    priceOverrideCents: integer("price_override_cents"),
    vatRegimeCode: text("vat_regime_code").notNull().default("IVA22"),
    optional: flag("optional"),
    costSource: text("cost_source", { enum: COST_SOURCES }).notNull().default("manual"),
    estimateMinCents: integer("estimate_min_cents"),
    estimateMaxCents: integer("estimate_max_cents"),
    benchmarkIds: text("benchmark_ids", { mode: "json" }).$type<string[]>(),
    supplierId: text("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    notes: text("notes"),
  },
  (t) => [index("quote_lines_quote_idx").on(t.quoteId)],
);

export const priceBenchmarks = sqliteTable("price_benchmarks", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  supplierId: text("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  supplierName: text("supplier_name"),
  city: text("city"),
  area: text("area"),
  useCase: text("use_case"),
  paxRef: integer("pax_ref"),
  observedAt: text("observed_at"),
  pricingModel: text("pricing_model", { enum: PRICING_MODELS }).notNull(),
  pricingModelLabel: text("pricing_model_label"),
  unit: text("unit"),
  includedQuantity: real("included_quantity"),
  unitCostCents: integer("unit_cost_cents"),
  fixedCostCents: integer("fixed_cost_cents"),
  totalCents: integer("total_cents"),
  vatIncluded: text("vat_included", { enum: ["yes", "no", "unknown"] }).notNull().default("unknown"),
  included: text("included"),
  excluded: text("excluded"),
  sourceKind: text("source_kind", { enum: ["sheet", "pdf", "supplier_quote", "manual"] }).notNull(),
  sourceKey: text("source_key").unique(),
  documentId: text("document_id").references(() => documents.id, { onDelete: "set null" }),
  page: integer("page"),
  driveFileId: text("drive_file_id"),
  reviewStatus: text("review_status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("approved"),
  raw: text("raw", { mode: "json" }).$type<Record<string, string>>(),
  createdAt: createdAt(),
});

// ── Piattaforme per trovare fornitori ────────────────────────────────────────

export const PLATFORM_TYPES = [
  "marketplace",
  "directory",
  "associazione",
  "convention_bureau",
  "software",
  "portale_ufficiale",
  "fornitore_nazionale",
] as const;
export const PLATFORM_STATUSES = ["in_uso", "da_valutare", "scartata"] as const;

// Marketplace, elenchi, associazioni e portali da cui partire per cercare fornitori nuovi,
// con i contatti pubblici della piattaforma stessa (presi dal suo sito, con la pagina come fonte).
export const platforms = sqliteTable(
  "platforms",
  {
    id: text("id").primaryKey(),
    // chiave delle piattaforme fornite con l'app: i nuovi rilasci aggiungono senza toccare le modifiche
    seedKey: text("seed_key").unique(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    domain: text("domain"),
    // chiavi della checklist (location, catering, …) più "dmc" e "generale"
    categories: text("categories", { mode: "json" }).notNull().$type<string[]>(),
    type: text("type", { enum: PLATFORM_TYPES }).notNull(),
    description: text("description"),
    howToUse: text("how_to_use"),
    coverage: text("coverage"),
    organizerCost: text("organizer_cost"),
    email: text("email"),
    emailSource: text("email_source"),
    phone: text("phone"),
    phoneDisplay: text("phone_display"),
    phoneSource: text("phone_source"),
    contactPage: text("contact_page"),
    // URL di ricerca con {q} e {city}, se la piattaforma lo permette
    searchUrl: text("search_url"),
    notes: text("notes"),
    status: text("status", { enum: PLATFORM_STATUSES }).notNull().default("da_valutare"),
    source: text("source", { enum: ["research", "manual"] }).notNull().default("manual"),
    verifiedAt: text("verified_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("platforms_status_idx").on(t.status)],
);

// ── Fornitori e contatti ─────────────────────────────────────────────────────

export const suppliers = sqliteTable(
  "suppliers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind", { enum: SUPPLIER_KINDS }).notNull().default("other"),
    categories: text("categories", { mode: "json" }).$type<string[]>(),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    address: text("address"),
    website: text("website"),
    domain: text("domain"),
    notes: text("notes"),
    rating: integer("rating"),
    source: text("source", { enum: ["sheet", "pdf", "web_search", "platform", "manual"] }).notNull(),
    // piattaforma su cui è stato trovato (se trovato lì)
    platformId: text("platform_id").references(() => platforms.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("suppliers_domain_idx").on(t.domain), index("suppliers_name_idx").on(t.name)],
);

export type ContactEvidence = {
  documentId?: string;
  page?: number;
  url?: string;
  evidencePath?: string;
  snippet?: string;
};

export const supplierContacts = sqliteTable(
  "supplier_contacts",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    type: text("type", { enum: CONTACT_TYPES }).notNull(),
    value: text("value").notNull(),
    display: text("display").notNull(),
    person: text("person"),
    role: text("role"),
    status: text("status", { enum: CONTACT_STATUSES }).notNull(),
    verificationMethod: text("verification_method", {
      enum: ["pdf_text", "page_fetch", "manual_call", "manual_entry"],
    }),
    evidence: text("evidence", { mode: "json" }).$type<ContactEvidence>(),
    verifiedAt: text("verified_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("supplier_contacts_unique_idx").on(t.supplierId, t.type, t.value)],
);

export const supplierLinks = sqliteTable(
  "supplier_links",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    quoteLineId: text("quote_line_id").references(() => quoteLines.id, { onDelete: "set null" }),
    componentId: text("component_id").references(() => components.id, { onDelete: "set null" }),
    category: text("category"),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    status: text("status", { enum: LINK_STATUSES }).notNull().default("to_contact"),
    optionExpiresAt: text("option_expires_at"),
    quotedCostCents: integer("quoted_cost_cents"),
    quotedCostIncludesVat: flag("quoted_cost_includes_vat"),
    quoteDocumentId: text("quote_document_id").references(() => documents.id, { onDelete: "set null" }),
    nextActionAt: text("next_action_at"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("supplier_links_project_idx").on(t.projectId)],
);

export const supplierInteractions = sqliteTable("supplier_interactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  linkId: text("link_id")
    .notNull()
    .references(() => supplierLinks.id, { onDelete: "cascade" }),
  at: text("at").notNull().$defaultFn(now),
  channel: text("channel", { enum: ["phone", "email", "whatsapp", "meeting", "other"] }).notNull(),
  outcome: text("outcome"),
  notes: text("notes"),
});

export const rfqDrafts = sqliteTable("rfq_drafts", {
  id: text("id").primaryKey(),
  linkId: text("link_id")
    .notNull()
    .references(() => supplierLinks.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

// ── Archivio: proposte passate, venue, format ────────────────────────────────

export const referenceWorks = sqliteTable("reference_works", {
  id: text("id").primaryKey(),
  sourceKey: text("source_key").notNull().unique(),
  name: text("name").notNull(),
  driveFileId: text("drive_file_id"),
  documentId: text("document_id").references(() => documents.id, { onDelete: "set null" }),
  eventType: text("event_type"),
  paxText: text("pax_text"),
  paxMin: integer("pax_min"),
  paxMax: integer("pax_max"),
  durationText: text("duration_text"),
  area: text("area"),
  concept: text("concept"),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  engagement: text("engagement"),
  overnight: text("overnight"),
  budgetText: text("budget_text"),
  fitScore: integer("fit_score"),
  fitReason: text("fit_reason"),
  raw: text("raw", { mode: "json" }).$type<Record<string, string>>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const venues = sqliteTable("venues", {
  id: text("id").primaryKey(),
  sourceKey: text("source_key").notNull().unique(),
  name: text("name").notNull(),
  driveFileId: text("drive_file_id"),
  documentId: text("document_id").references(() => documents.id, { onDelete: "set null" }),
  supplierId: text("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  assetType: text("asset_type"),
  city: text("city"),
  region: text("region"),
  country: text("country"),
  locationType: text("location_type"),
  capacityMax: integer("capacity_max"),
  capacityText: text("capacity_text"),
  usp: text("usp"),
  constraints: text("constraints"),
  rooms: integer("rooms"),
  roomsText: text("rooms_text"),
  budgetLevel: text("budget_level"),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  bestFor: text("best_for"),
  fitScore: integer("fit_score"),
  fitReason: text("fit_reason"),
  raw: text("raw", { mode: "json" }).$type<Record<string, string>>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const venueRooms = sqliteTable("venue_rooms", {
  id: text("id").primaryKey(),
  venueId: text("venue_id")
    .notNull()
    .references(() => venues.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  setup: text("setup", {
    enum: ["theatre", "classroom", "cabaret", "banquet", "cocktail", "u_shape", "boardroom", "other"],
  }).notNull(),
  capacity: integer("capacity").notNull(),
  areaSqm: real("area_sqm"),
  heightM: real("height_m"),
  notes: text("notes"),
  documentId: text("document_id").references(() => documents.id, { onDelete: "set null" }),
  page: integer("page"),
});

export const formatIdeas = sqliteTable("format_ideas", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  type: text("type", {
    enum: ["format", "sensory", "spatial", "narrative", "food", "social", "tech", "wellbeing", "learning"],
  }).notNull(),
  paxMin: integer("pax_min"),
  paxMax: integer("pax_max"),
  costLevel: text("cost_level", { enum: ["low", "mid", "high"] }).notNull().default("mid"),
  suppliersHint: text("suppliers_hint"),
  sourceWorkId: text("source_work_id").references(() => referenceWorks.id, { onDelete: "set null" }),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  triedByUs: flag("tried_by_us"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

// ── Immagini, export, AI, impostazioni ───────────────────────────────────────

export const imageAssets = sqliteTable("image_assets", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  purpose: text("purpose", { enum: ["key_visual", "moodboard", "application"] }).notNull(),
  prompt: text("prompt").notNull(),
  negativePrompt: text("negative_prompt"),
  model: text("model").notNull(),
  size: text("size").notNull(),
  seed: integer("seed"),
  path: text("path").notNull(),
  width: integer("width"),
  height: integer("height"),
  selected: flag("selected"),
  runId: text("run_id"),
  createdAt: createdAt(),
});

export const exportsTable = sqliteTable("exports", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  quoteId: text("quote_id").references(() => quotes.id, { onDelete: "set null" }),
  kind: text("kind", { enum: ["pptx", "html", "xlsx", "pdf"] }).notNull(),
  variant: text("variant", { enum: ["client", "internal", "technical"] }).notNull(),
  path: text("path").notNull(),
  createdAt: createdAt(),
});

export const aiRuns = sqliteTable(
  "ai_runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    task: text("task").notNull(),
    parentRunId: text("parent_run_id"),
    status: text("status", { enum: RUN_STATUSES }).notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    progressMessage: text("progress_message"),
    input: text("input", { mode: "json" }).$type<Record<string, unknown>>(),
    output: text("output", { mode: "json" }).$type<Record<string, unknown>>(),
    error: text("error"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    // costo stimato in micro-euro (1 € = 1.000.000)
    costMicros: integer("cost_micros").notNull().default(0),
    cancelRequested: flag("cancel_requested"),
    // in cloud: gettone monouso con cui la funzione che esegue il lavoro lo prende in carico
    dispatchToken: text("dispatch_token"),
    heartbeatAt: text("heartbeat_at"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_runs_status_idx").on(t.status), index("ai_runs_project_idx").on(t.projectId)],
);

// Una riga per ogni chiamata al modello (un job può farne diverse).
export const aiCalls = sqliteTable(
  "ai_calls",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id").references(() => aiRuns.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    task: text("task").notNull(),
    model: text("model").notNull(),
    kind: text("kind", { enum: ["chat", "search", "image", "ocr"] }).notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    units: integer("units").notNull().default(0),
    costMicros: integer("cost_micros").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    ok: integer("ok", { mode: "boolean" }).notNull().default(true),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_calls_project_idx").on(t.projectId)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull().$type<unknown>(),
  updatedAt: updatedAt(),
});

export const counters = sqliteTable("counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
});

// ── Utenti e accessi (solo nella versione online) ────────────────────────────

export const USER_ROLES = ["admin", "member"] as const;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  // sempre in minuscolo
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role", { enum: USER_ROLES }).notNull().default("member"),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: flag("must_change_password"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: text("locked_until"),
  lastLoginAt: text("last_login_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    // hash SHA-256 del gettone nel cookie: chi legge il database non può riusare le sessioni
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);
