CREATE TABLE `activity_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bot_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`desired_state` text NOT NULL,
	`updated_at` integer NOT NULL,
	`host` text,
	`port` integer,
	`username` text,
	`version` text
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player` text NOT NULL,
	`command` text NOT NULL,
	`understood` text NOT NULL,
	`actions` text NOT NULL,
	`created_at` integer NOT NULL
);
