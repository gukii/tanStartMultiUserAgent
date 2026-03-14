CREATE TABLE `telemetry_action_sequences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`submission_cycle_id` text,
	`field_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`completed_at` integer,
	`duration_ms` integer,
	`participant_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`value_before` text,
	`value_after` text,
	`action_type` text NOT NULL,
	`previous_participant_id` integer,
	`previous_user_id` text,
	`previous_user_name` text,
	`had_validation_error` integer DEFAULT false NOT NULL,
	`fixed_validation_error` integer DEFAULT false NOT NULL,
	`introduced_validation_error` integer DEFAULT false NOT NULL,
	`keystroke_count` integer DEFAULT 0 NOT NULL,
	`value_change_percent` integer,
	FOREIGN KEY (`session_id`) REFERENCES `telemetry_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `telemetry_participants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`previous_participant_id`) REFERENCES `telemetry_participants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_action_sequences_session` ON `telemetry_action_sequences` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_action_sequences_cycle` ON `telemetry_action_sequences` (`submission_cycle_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_action_sequences_field` ON `telemetry_action_sequences` (`field_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_action_sequences_participant` ON `telemetry_action_sequences` (`participant_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_action_sequences_timestamp` ON `telemetry_action_sequences` (`timestamp`);--> statement-breakpoint
CREATE TABLE `telemetry_collaborative_edits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`field_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`participant_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`value_before` text,
	`value_after` text,
	`edit_type` text NOT NULL,
	`previous_participant_id` integer,
	`previous_user_id` text,
	`previous_user_name` text,
	`had_validation_error` integer DEFAULT false NOT NULL,
	`fixed_validation_error` integer DEFAULT false NOT NULL,
	`introduced_validation_error` integer DEFAULT false NOT NULL,
	`edit_duration_ms` integer,
	`value_change_percent` integer,
	FOREIGN KEY (`session_id`) REFERENCES `telemetry_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `telemetry_participants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`previous_participant_id`) REFERENCES `telemetry_participants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_collab_edits_session` ON `telemetry_collaborative_edits` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_collab_edits_field` ON `telemetry_collaborative_edits` (`field_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_collab_edits_participant` ON `telemetry_collaborative_edits` (`participant_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_collab_edits_session_field` ON `telemetry_collaborative_edits` (`session_id`,`field_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_collab_edits_timestamp` ON `telemetry_collaborative_edits` (`timestamp`);--> statement-breakpoint
CREATE TABLE `telemetry_submission_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`submitted_at` integer,
	`duration_ms` integer,
	`submitted_by` text,
	`submitted_by_name` text,
	`total_participants` integer DEFAULT 0 NOT NULL,
	`total_fields` integer DEFAULT 0 NOT NULL,
	`total_actions` integer DEFAULT 0 NOT NULL,
	`actions_new` integer DEFAULT 0 NOT NULL,
	`actions_extend` integer DEFAULT 0 NOT NULL,
	`actions_replace` integer DEFAULT 0 NOT NULL,
	`actions_shorten` integer DEFAULT 0 NOT NULL,
	`errors_fixed` integer DEFAULT 0 NOT NULL,
	`errors_broke` integer DEFAULT 0 NOT NULL,
	`accuracy` real,
	`collaboration_score` real,
	FOREIGN KEY (`session_id`) REFERENCES `telemetry_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_submission_cycles_session` ON `telemetry_submission_cycles` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_submission_cycles_timestamp` ON `telemetry_submission_cycles` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_submission_cycles_submitted` ON `telemetry_submission_cycles` (`submitted_at`);