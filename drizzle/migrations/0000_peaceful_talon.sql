CREATE TABLE `telemetry_ai_interactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`participant_id` integer NOT NULL,
	`field_session_id` integer,
	`draft_id` text NOT NULL,
	`field_id` text NOT NULL,
	`requested_at` integer NOT NULL,
	`responded_at` integer,
	`response_time_ms` integer,
	`prompt` text,
	`suggested_value` text,
	`confidence` real,
	`user_action` text,
	`actioned_at` integer,
	`time_to_decision_ms` integer,
	`final_value` text,
	`edit_distance` integer,
	FOREIGN KEY (`session_id`) REFERENCES `telemetry_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `telemetry_participants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`field_session_id`) REFERENCES `telemetry_field_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_ai_session` ON `telemetry_ai_interactions` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_ai_participant` ON `telemetry_ai_interactions` (`participant_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_ai_draft` ON `telemetry_ai_interactions` (`draft_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_ai_field` ON `telemetry_ai_interactions` (`field_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_ai_timestamp` ON `telemetry_ai_interactions` (`requested_at`);--> statement-breakpoint
CREATE TABLE `telemetry_conflict_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`field_id` text NOT NULL,
	`requesting_participant_id` integer NOT NULL,
	`lock_holder_participant_id` integer,
	`conflict_type` text NOT NULL,
	`resolved_at` integer,
	`resolution_time_ms` integer,
	`resolution_method` text,
	FOREIGN KEY (`session_id`) REFERENCES `telemetry_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requesting_participant_id`) REFERENCES `telemetry_participants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lock_holder_participant_id`) REFERENCES `telemetry_participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_conflict_session` ON `telemetry_conflict_events` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_conflict_field` ON `telemetry_conflict_events` (`field_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_conflict_timestamp` ON `telemetry_conflict_events` (`timestamp`);--> statement-breakpoint
CREATE TABLE `telemetry_cursor_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`participant_id` integer NOT NULL,
	`timestamp` integer NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`scroll_x` integer DEFAULT 0 NOT NULL,
	`scroll_y` integer DEFAULT 0 NOT NULL,
	`active_field_id` text,
	FOREIGN KEY (`session_id`) REFERENCES `telemetry_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `telemetry_participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_cursor_session` ON `telemetry_cursor_movements` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_cursor_participant` ON `telemetry_cursor_movements` (`participant_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_cursor_timestamp` ON `telemetry_cursor_movements` (`timestamp`);--> statement-breakpoint
CREATE TABLE `telemetry_field_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`participant_id` integer NOT NULL,
	`field_id` text NOT NULL,
	`field_type` text NOT NULL,
	`field_label` text,
	`ai_intent` text,
	`focused_at` integer NOT NULL,
	`blurred_at` integer,
	`duration_ms` integer,
	`keystroke_count` integer DEFAULT 0 NOT NULL,
	`paste_count` integer DEFAULT 0 NOT NULL,
	`edit_count` integer DEFAULT 0 NOT NULL,
	`initial_value` text,
	`final_value` text,
	`was_completed` integer DEFAULT false NOT NULL,
	`had_validation_error` integer DEFAULT false NOT NULL,
	`ai_draft_offered` integer DEFAULT false NOT NULL,
	`ai_draft_accepted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `telemetry_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `telemetry_participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_field_sessions_session` ON `telemetry_field_sessions` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_field_sessions_participant` ON `telemetry_field_sessions` (`participant_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_field_sessions_field` ON `telemetry_field_sessions` (`field_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_field_sessions_session_field` ON `telemetry_field_sessions` (`session_id`,`field_id`);--> statement-breakpoint
CREATE TABLE `telemetry_interactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`participant_id` integer NOT NULL,
	`timestamp` integer NOT NULL,
	`sequence_id` integer NOT NULL,
	`event_type` text NOT NULL,
	`event_category` text NOT NULL,
	`field_id` text,
	`field_type` text,
	`data` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `telemetry_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `telemetry_participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_interactions_session` ON `telemetry_interactions` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_interactions_participant` ON `telemetry_interactions` (`participant_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_interactions_timestamp` ON `telemetry_interactions` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_interactions_event_type` ON `telemetry_interactions` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_interactions_session_timestamp` ON `telemetry_interactions` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_interactions_sequence` ON `telemetry_interactions` (`session_id`,`participant_id`,`sequence_id`);--> statement-breakpoint
CREATE TABLE `telemetry_keystroke_sequences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`field_session_id` integer NOT NULL,
	`timestamp` integer NOT NULL,
	`key` text,
	`key_code` text,
	`inter_keystroke_ms` integer,
	`cursor_position` integer,
	`value_length` integer,
	FOREIGN KEY (`field_session_id`) REFERENCES `telemetry_field_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_keystrokes_field_session` ON `telemetry_keystroke_sequences` (`field_session_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_keystrokes_timestamp` ON `telemetry_keystroke_sequences` (`timestamp`);--> statement-breakpoint
CREATE TABLE `telemetry_participants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`user_color` text,
	`user_type` text DEFAULT 'human' NOT NULL,
	`user_agent` text,
	`viewport` text,
	`locale` text,
	`timezone` text,
	`joined_at` integer NOT NULL,
	`left_at` integer,
	`duration_ms` integer,
	`total_interactions` integer DEFAULT 0 NOT NULL,
	`total_keystrokes` integer DEFAULT 0 NOT NULL,
	`total_fields_edited` integer DEFAULT 0 NOT NULL,
	`total_validation_errors` integer DEFAULT 0 NOT NULL,
	`ai_drafts_accepted` integer DEFAULT 0 NOT NULL,
	`ai_drafts_rejected` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `telemetry_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_participants_session` ON `telemetry_participants` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_participants_user` ON `telemetry_participants` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_participants_session_user` ON `telemetry_participants` (`session_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `telemetry_performance_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`participant_id` integer NOT NULL,
	`timestamp` integer NOT NULL,
	`memory_used_mb` real,
	`memory_limit_mb` real,
	`ws_latency_ms` integer,
	`ws_message_queue_size` integer,
	`fps` integer,
	`long_task_count` integer,
	`custom_metrics` text,
	FOREIGN KEY (`session_id`) REFERENCES `telemetry_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `telemetry_participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_performance_session` ON `telemetry_performance_metrics` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_performance_participant` ON `telemetry_performance_metrics` (`participant_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_performance_timestamp` ON `telemetry_performance_metrics` (`timestamp`);--> statement-breakpoint
CREATE TABLE `telemetry_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`route` text NOT NULL,
	`submit_mode` text DEFAULT 'any' NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_ms` integer,
	`outcome` text,
	`total_participants` integer DEFAULT 0 NOT NULL,
	`total_interactions` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_sessions_room` ON `telemetry_sessions` (`room_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_sessions_route` ON `telemetry_sessions` (`route`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_sessions_started` ON `telemetry_sessions` (`started_at`);--> statement-breakpoint
CREATE TABLE `telemetry_validation_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`participant_id` integer NOT NULL,
	`field_session_id` integer,
	`timestamp` integer NOT NULL,
	`field_id` text NOT NULL,
	`error_type` text NOT NULL,
	`error_message` text NOT NULL,
	`attempted_value` text,
	`resolved_at` integer,
	`resolution_time_ms` integer,
	`corrected_value` text,
	FOREIGN KEY (`session_id`) REFERENCES `telemetry_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `telemetry_participants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`field_session_id`) REFERENCES `telemetry_field_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_validation_session` ON `telemetry_validation_events` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_validation_participant` ON `telemetry_validation_events` (`participant_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_validation_field` ON `telemetry_validation_events` (`field_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_validation_timestamp` ON `telemetry_validation_events` (`timestamp`);