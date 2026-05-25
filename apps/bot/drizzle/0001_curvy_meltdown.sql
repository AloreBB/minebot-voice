CREATE TABLE `ai_providers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_type` text NOT NULL,
	`display_name` text NOT NULL,
	`encrypted_key` text NOT NULL,
	`masked_key` text NOT NULL,
	`base_url` text,
	`model` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
