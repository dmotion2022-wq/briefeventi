CREATE TABLE `agenda_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`day` integer NOT NULL,
	`date` text,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`room` text,
	`pax` integer,
	`narrative_beat` text,
	`position` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agenda_slots_project_idx` ON `agenda_slots` (`project_id`);--> statement-breakpoint
CREATE TABLE `ai_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text,
	`project_id` text,
	`task` text NOT NULL,
	`model` text NOT NULL,
	`kind` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cached_tokens` integer DEFAULT 0 NOT NULL,
	`units` integer DEFAULT 0 NOT NULL,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`ok` integer DEFAULT true NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `ai_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_calls_project_idx` ON `ai_calls` (`project_id`);--> statement-breakpoint
CREATE TABLE `ai_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`task` text NOT NULL,
	`parent_run_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`progress_message` text,
	`input` text,
	`output` text,
	`error` text,
	`model` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cached_tokens` integer DEFAULT 0 NOT NULL,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`heartbeat_at` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_runs_status_idx` ON `ai_runs` (`status`);--> statement-breakpoint
CREATE INDEX `ai_runs_project_idx` ON `ai_runs` (`project_id`);--> statement-breakpoint
CREATE TABLE `briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`data` text NOT NULL,
	`run_id` text,
	`created_at` text NOT NULL,
	`confirmed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `checklist_items` (
	`key` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`description` text NOT NULL,
	`default_section` text NOT NULL,
	`default_vat_regime` text DEFAULT 'IVA22' NOT NULL,
	`default_markup_bp` integer DEFAULT 1500 NOT NULL,
	`sectors` text,
	`position` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `components` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`module_id` text,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`specs` text,
	`slot_ids` text,
	`quantity_hint` real,
	`unit_hint` text,
	`periods_hint` real,
	`pricing_model_hint` text,
	`optional` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `components_project_idx` ON `components` (`project_id`);--> statement-breakpoint
CREATE TABLE `concept_bibles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`concept_id` text,
	`version` integer NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `concepts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`variant` text NOT NULL,
	`data` text NOT NULL,
	`critique` text,
	`score_bp` integer,
	`status` text DEFAULT 'proposed' NOT NULL,
	`run_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `counters` (
	`key` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `document_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` text NOT NULL,
	`page_number` integer NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`text_source` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_pages_doc_page_idx` ON `document_pages` (`document_id`,`page_number`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`kind` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`sha256` text NOT NULL,
	`path` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`page_count` integer,
	`extraction_status` text DEFAULT 'pending' NOT NULL,
	`drive_file_id` text,
	`source_url` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `documents_project_idx` ON `documents` (`project_id`);--> statement-breakpoint
CREATE INDEX `documents_sha_idx` ON `documents` (`sha256`);--> statement-breakpoint
CREATE TABLE `exports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`quote_id` text,
	`kind` text NOT NULL,
	`variant` text NOT NULL,
	`path` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `format_ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`type` text NOT NULL,
	`pax_min` integer,
	`pax_max` integer,
	`cost_level` text DEFAULT 'mid' NOT NULL,
	`suppliers_hint` text,
	`source_work_id` text,
	`tags` text,
	`tried_by_us` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_work_id`) REFERENCES `reference_works`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `gap_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`brief_id` text NOT NULL,
	`checklist_key` text NOT NULL,
	`status` text NOT NULL,
	`criticality` text NOT NULL,
	`summary` text NOT NULL,
	`evidence` text,
	`assumption` text,
	`question` text,
	`answer` text,
	`assumption_accepted` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`brief_id`) REFERENCES `briefs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gap_items_project_idx` ON `gap_items` (`project_id`);--> statement-breakpoint
CREATE TABLE `image_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`purpose` text NOT NULL,
	`prompt` text NOT NULL,
	`negative_prompt` text,
	`model` text NOT NULL,
	`size` text NOT NULL,
	`seed` integer,
	`path` text NOT NULL,
	`width` integer,
	`height` integer,
	`selected` integer DEFAULT false NOT NULL,
	`run_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `modules` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`built_from` text,
	`run_id` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `modules_project_kind_idx` ON `modules` (`project_id`,`kind`);--> statement-breakpoint
CREATE TABLE `price_benchmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`supplier_id` text,
	`supplier_name` text,
	`city` text,
	`area` text,
	`use_case` text,
	`pax_ref` integer,
	`observed_at` text,
	`pricing_model` text NOT NULL,
	`pricing_model_label` text,
	`unit` text,
	`included_quantity` real,
	`unit_cost_cents` integer,
	`fixed_cost_cents` integer,
	`total_cents` integer,
	`vat_included` text DEFAULT 'unknown' NOT NULL,
	`included` text,
	`excluded` text,
	`source_kind` text NOT NULL,
	`source_key` text,
	`document_id` text,
	`page` integer,
	`drive_file_id` text,
	`review_status` text DEFAULT 'approved' NOT NULL,
	`raw` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `price_benchmarks_source_key_unique` ON `price_benchmarks` (`source_key`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`client_name` text NOT NULL,
	`sector` text DEFAULT 'corporate' NOT NULL,
	`event_type` text,
	`status` text DEFAULT 'brief' NOT NULL,
	`city` text,
	`region` text,
	`country` text DEFAULT 'IT',
	`start_date` text,
	`end_date` text,
	`pax_min` integer,
	`pax_target` integer,
	`pax_max` integer,
	`budget_cents` integer,
	`budget_note` text,
	`is_tender` integer DEFAULT false NOT NULL,
	`tender_deadline` text,
	`confidential` integer DEFAULT false NOT NULL,
	`confidential_terms` text,
	`selected_concept_id` text,
	`outcome` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_code_unique` ON `projects` (`code`);--> statement-breakpoint
CREATE TABLE `quote_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_id` text NOT NULL,
	`section_id` text NOT NULL,
	`component_id` text,
	`position` integer NOT NULL,
	`description` text NOT NULL,
	`detail` text,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'n.' NOT NULL,
	`periods` real DEFAULT 1 NOT NULL,
	`period_unit` text DEFAULT 'none' NOT NULL,
	`pricing_model` text DEFAULT 'unit' NOT NULL,
	`unit_cost_cents` integer DEFAULT 0 NOT NULL,
	`fixed_cost_cents` integer DEFAULT 0 NOT NULL,
	`included_quantity` real,
	`extra_unit_cost_cents` integer,
	`percent_bp` integer,
	`percent_of_line_ids` text,
	`cost_includes_vat` integer DEFAULT false NOT NULL,
	`supplier_vat_rate_bp` integer DEFAULT 2200 NOT NULL,
	`markup_bp` integer DEFAULT 0 NOT NULL,
	`price_override_cents` integer,
	`vat_regime_code` text DEFAULT 'IVA22' NOT NULL,
	`optional` integer DEFAULT false NOT NULL,
	`cost_source` text DEFAULT 'manual' NOT NULL,
	`estimate_min_cents` integer,
	`estimate_max_cents` integer,
	`benchmark_ids` text,
	`supplier_id` text,
	`notes` text,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `quote_sections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `quote_lines_quote_idx` ON `quote_lines` (`quote_id`);--> statement-breakpoint
CREATE TABLE `quote_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`optional` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`number` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`validity_days` integer DEFAULT 30 NOT NULL,
	`agency_fee_bp` integer DEFAULT 0 NOT NULL,
	`agency_fee_vat_regime` text DEFAULT 'IVA22' NOT NULL,
	`contingency_bp` integer DEFAULT 0 NOT NULL,
	`contingency_mode` text DEFAULT 'internal' NOT NULL,
	`rounding` text DEFAULT 'none' NOT NULL,
	`payment_tranches` text,
	`notes` text,
	`snapshot` text,
	`created_at` text NOT NULL,
	`sent_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_number_rev_idx` ON `quotes` (`number`,`revision`);--> statement-breakpoint
CREATE TABLE `reference_works` (
	`id` text PRIMARY KEY NOT NULL,
	`source_key` text NOT NULL,
	`name` text NOT NULL,
	`drive_file_id` text,
	`document_id` text,
	`event_type` text,
	`pax_text` text,
	`pax_min` integer,
	`pax_max` integer,
	`duration_text` text,
	`area` text,
	`concept` text,
	`tags` text,
	`engagement` text,
	`overnight` text,
	`budget_text` text,
	`fit_score` integer,
	`fit_reason` text,
	`raw` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reference_works_source_key_unique` ON `reference_works` (`source_key`);--> statement-breakpoint
CREATE TABLE `rfq_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `supplier_links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `supplier_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`type` text NOT NULL,
	`value` text NOT NULL,
	`display` text NOT NULL,
	`person` text,
	`role` text,
	`status` text NOT NULL,
	`verification_method` text,
	`evidence` text,
	`verified_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplier_contacts_unique_idx` ON `supplier_contacts` (`supplier_id`,`type`,`value`);--> statement-breakpoint
CREATE TABLE `supplier_interactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`link_id` text NOT NULL,
	`at` text NOT NULL,
	`channel` text NOT NULL,
	`outcome` text,
	`notes` text,
	FOREIGN KEY (`link_id`) REFERENCES `supplier_links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `supplier_links` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`quote_line_id` text,
	`component_id` text,
	`category` text,
	`supplier_id` text NOT NULL,
	`status` text DEFAULT 'to_contact' NOT NULL,
	`option_expires_at` text,
	`quoted_cost_cents` integer,
	`quoted_cost_includes_vat` integer DEFAULT false NOT NULL,
	`quote_document_id` text,
	`next_action_at` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quote_line_id`) REFERENCES `quote_lines`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quote_document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `supplier_links_project_idx` ON `supplier_links` (`project_id`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`categories` text,
	`city` text,
	`region` text,
	`country` text,
	`address` text,
	`website` text,
	`domain` text,
	`notes` text,
	`rating` integer,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `suppliers_domain_idx` ON `suppliers` (`domain`);--> statement-breakpoint
CREATE INDEX `suppliers_name_idx` ON `suppliers` (`name`);--> statement-breakpoint
CREATE TABLE `vat_regimes` (
	`code` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`rate_bp` integer NOT NULL,
	`invoice_note` text,
	`allow_markup` integer DEFAULT true NOT NULL,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `venue_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`venue_id` text NOT NULL,
	`name` text NOT NULL,
	`setup` text NOT NULL,
	`capacity` integer NOT NULL,
	`area_sqm` real,
	`height_m` real,
	`notes` text,
	`document_id` text,
	`page` integer,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `venues` (
	`id` text PRIMARY KEY NOT NULL,
	`source_key` text NOT NULL,
	`name` text NOT NULL,
	`drive_file_id` text,
	`document_id` text,
	`supplier_id` text,
	`asset_type` text,
	`city` text,
	`region` text,
	`country` text,
	`location_type` text,
	`capacity_max` integer,
	`capacity_text` text,
	`usp` text,
	`constraints` text,
	`rooms` integer,
	`rooms_text` text,
	`budget_level` text,
	`tags` text,
	`best_for` text,
	`fit_score` integer,
	`fit_reason` text,
	`raw` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `venues_source_key_unique` ON `venues` (`source_key`);