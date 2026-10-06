CREATE TABLE `platforms` (
	`id` text PRIMARY KEY NOT NULL,
	`seed_key` text,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`domain` text,
	`categories` text NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`how_to_use` text,
	`coverage` text,
	`organizer_cost` text,
	`email` text,
	`email_source` text,
	`phone` text,
	`phone_display` text,
	`phone_source` text,
	`contact_page` text,
	`search_url` text,
	`notes` text,
	`status` text DEFAULT 'da_valutare' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`verified_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platforms_seed_key_unique` ON `platforms` (`seed_key`);--> statement-breakpoint
CREATE INDEX `platforms_status_idx` ON `platforms` (`status`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`user_agent` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`password_hash` text NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`last_login_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `ai_runs` ADD `dispatch_token` text;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `platform_id` text REFERENCES platforms(id) ON DELETE set null;