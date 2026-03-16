ALTER TABLE `telemetry_submission_cycles` ADD `actions_insert` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `telemetry_submission_cycles` ADD `actions_edit` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `telemetry_submission_cycles` ADD `actions_delete` integer DEFAULT 0 NOT NULL;