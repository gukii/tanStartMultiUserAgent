import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

/**
 * Telemetry Database Schema
 *
 * This schema captures rich interaction data for:
 * - User proficiency analysis (keystroke speed, error patterns)
 * - Engagement tracking (time spent, focus patterns)
 * - AI agent evaluation (suggestion quality, acceptance rates)
 * - Training insights (collaboration patterns, progress)
 */

// ============================================================================
// 1. Sessions - High-level session metadata
// ============================================================================
export const telemetrySessions = sqliteTable('telemetry_sessions', {
  id: text('id').primaryKey(), // UUID
  roomId: text('room_id').notNull(),
  route: text('route').notNull(), // Extracted from roomId (e.g., '/invoice/edit')
  submitMode: text('submit_mode').notNull().default('any'), // 'any' or 'consensus'
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  durationMs: integer('duration_ms'),
  outcome: text('outcome'), // 'submitted', 'abandoned', 'error'
  totalParticipants: integer('total_participants').notNull().default(0),
  totalInteractions: integer('total_interactions').notNull().default(0),
}, (table) => ({
  roomIdx: index('idx_telemetry_sessions_room').on(table.roomId),
  routeIdx: index('idx_telemetry_sessions_route').on(table.route),
  startedAtIdx: index('idx_telemetry_sessions_started').on(table.startedAt),
}));

// ============================================================================
// 2. Participants - Users/agents per session
// ============================================================================
export const telemetryParticipants = sqliteTable('telemetry_participants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => telemetrySessions.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull(),
  userColor: text('user_color'),
  userType: text('user_type').notNull().default('human'), // 'human' or 'ai'

  // Environment metadata
  userAgent: text('user_agent'),
  viewport: text('viewport'), // JSON: { width, height }
  locale: text('locale'),
  timezone: text('timezone'),

  // Session participation
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull(),
  leftAt: integer('left_at', { mode: 'timestamp' }),
  durationMs: integer('duration_ms'),

  // Engagement metrics (aggregated)
  totalInteractions: integer('total_interactions').notNull().default(0),
  totalKeystrokes: integer('total_keystrokes').notNull().default(0),
  totalFieldsEdited: integer('total_fields_edited').notNull().default(0),
  totalValidationErrors: integer('total_validation_errors').notNull().default(0),
  aiDraftsAccepted: integer('ai_drafts_accepted').notNull().default(0),
  aiDraftsRejected: integer('ai_drafts_rejected').notNull().default(0),
}, (table) => ({
  sessionIdx: index('idx_telemetry_participants_session').on(table.sessionId),
  userIdx: index('idx_telemetry_participants_user').on(table.userId),
  sessionUserIdx: index('idx_telemetry_participants_session_user').on(table.sessionId, table.userId),
}));

// ============================================================================
// 3. Interactions - Raw event stream (high-volume)
// ============================================================================
export const telemetryInteractions = sqliteTable('telemetry_interactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => telemetrySessions.id, { onDelete: 'cascade' }),
  participantId: integer('participant_id').notNull().references(() => telemetryParticipants.id, { onDelete: 'cascade' }),

  // Event metadata
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  sequenceId: integer('sequence_id').notNull(), // Client-side sequence for deduplication
  eventType: text('event_type').notNull(), // 'cursor_move', 'field_input', 'validation_error', etc.
  eventCategory: text('event_category').notNull(), // 'cursor', 'field', 'validation', 'draft', 'interaction', 'conflict', 'system'

  // Event context
  fieldId: text('field_id'), // Field identifier (if applicable)
  fieldType: text('field_type'), // 'text', 'email', 'number', etc.

  // Event data (JSON)
  data: text('data').notNull(), // JSON payload specific to event type
}, (table) => ({
  sessionIdx: index('idx_telemetry_interactions_session').on(table.sessionId),
  participantIdx: index('idx_telemetry_interactions_participant').on(table.participantId),
  timestampIdx: index('idx_telemetry_interactions_timestamp').on(table.timestamp),
  eventTypeIdx: index('idx_telemetry_interactions_event_type').on(table.eventType),
  sessionTimestampIdx: index('idx_telemetry_interactions_session_timestamp').on(table.sessionId, table.timestamp),
  sequenceIdx: index('idx_telemetry_interactions_sequence').on(table.sessionId, table.participantId, table.sequenceId),
}));

// ============================================================================
// 4. Field Sessions - Per-field metrics
// ============================================================================
export const telemetryFieldSessions = sqliteTable('telemetry_field_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => telemetrySessions.id, { onDelete: 'cascade' }),
  participantId: integer('participant_id').notNull().references(() => telemetryParticipants.id, { onDelete: 'cascade' }),

  // Field metadata
  fieldId: text('field_id').notNull(),
  fieldType: text('field_type').notNull(),
  fieldLabel: text('field_label'),
  aiIntent: text('ai_intent'), // Semantic intent for AI (e.g., 'invoice_number', 'customer_name')

  // Session timing
  focusedAt: integer('focused_at', { mode: 'timestamp' }).notNull(),
  blurredAt: integer('blurred_at', { mode: 'timestamp' }),
  durationMs: integer('duration_ms'),

  // Interaction metrics
  keystrokeCount: integer('keystroke_count').notNull().default(0),
  pasteCount: integer('paste_count').notNull().default(0),
  editCount: integer('edit_count').notNull().default(0), // Number of value changes

  // Field completion
  initialValue: text('initial_value'), // Sanitized based on PII mode
  finalValue: text('final_value'), // Sanitized based on PII mode
  wasCompleted: integer('was_completed', { mode: 'boolean' }).notNull().default(false),
  hadValidationError: integer('had_validation_error', { mode: 'boolean' }).notNull().default(false),

  // AI assistance
  aiDraftOffered: integer('ai_draft_offered', { mode: 'boolean' }).notNull().default(false),
  aiDraftAccepted: integer('ai_draft_accepted', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  sessionIdx: index('idx_telemetry_field_sessions_session').on(table.sessionId),
  participantIdx: index('idx_telemetry_field_sessions_participant').on(table.participantId),
  fieldIdx: index('idx_telemetry_field_sessions_field').on(table.fieldId),
  sessionFieldIdx: index('idx_telemetry_field_sessions_session_field').on(table.sessionId, table.fieldId),
}));

// ============================================================================
// 5. Keystroke Sequences - Typing cadence analysis
// ============================================================================
export const telemetryKeystrokeSequences = sqliteTable('telemetry_keystroke_sequences', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fieldSessionId: integer('field_session_id').notNull().references(() => telemetryFieldSessions.id, { onDelete: 'cascade' }),

  // Keystroke metadata
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  key: text('key'), // Key pressed (sanitized based on PII mode)
  keyCode: text('key_code'),

  // Timing analysis
  interKeystrokeMs: integer('inter_keystroke_ms'), // Time since previous keystroke

  // Context
  cursorPosition: integer('cursor_position'), // Position in field
  valueLength: integer('value_length'), // Length of field value after keystroke
}, (table) => ({
  fieldSessionIdx: index('idx_telemetry_keystrokes_field_session').on(table.fieldSessionId),
  timestampIdx: index('idx_telemetry_keystrokes_timestamp').on(table.timestamp),
}));

// ============================================================================
// 6. Cursor Movements - Sampled cursor positions (200ms intervals)
// ============================================================================
export const telemetryCursorMovements = sqliteTable('telemetry_cursor_movements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => telemetrySessions.id, { onDelete: 'cascade' }),
  participantId: integer('participant_id').notNull().references(() => telemetryParticipants.id, { onDelete: 'cascade' }),

  // Cursor position
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  x: integer('x').notNull(),
  y: integer('y').notNull(),

  // Scroll context
  scrollX: integer('scroll_x').notNull().default(0),
  scrollY: integer('scroll_y').notNull().default(0),

  // Active field
  activeFieldId: text('active_field_id'),
}, (table) => ({
  sessionIdx: index('idx_telemetry_cursor_session').on(table.sessionId),
  participantIdx: index('idx_telemetry_cursor_participant').on(table.participantId),
  timestampIdx: index('idx_telemetry_cursor_timestamp').on(table.timestamp),
}));

// ============================================================================
// 7. Validation Events - Validation errors and corrections
// ============================================================================
export const telemetryValidationEvents = sqliteTable('telemetry_validation_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => telemetrySessions.id, { onDelete: 'cascade' }),
  participantId: integer('participant_id').notNull().references(() => telemetryParticipants.id, { onDelete: 'cascade' }),
  fieldSessionId: integer('field_session_id').references(() => telemetryFieldSessions.id, { onDelete: 'cascade' }),

  // Validation metadata
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  fieldId: text('field_id').notNull(),

  // Error details
  errorType: text('error_type').notNull(), // 'required', 'format', 'range', 'custom'
  errorMessage: text('error_message').notNull(),
  attemptedValue: text('attempted_value'), // Sanitized based on PII mode

  // Resolution
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  resolutionTimeMs: integer('resolution_time_ms'),
  correctedValue: text('corrected_value'), // Sanitized based on PII mode
}, (table) => ({
  sessionIdx: index('idx_telemetry_validation_session').on(table.sessionId),
  participantIdx: index('idx_telemetry_validation_participant').on(table.participantId),
  fieldIdx: index('idx_telemetry_validation_field').on(table.fieldId),
  timestampIdx: index('idx_telemetry_validation_timestamp').on(table.timestamp),
}));

// ============================================================================
// 8. AI Interactions - AI suggestion lifecycle
// ============================================================================
export const telemetryAiInteractions = sqliteTable('telemetry_ai_interactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => telemetrySessions.id, { onDelete: 'cascade' }),
  participantId: integer('participant_id').notNull().references(() => telemetryParticipants.id, { onDelete: 'cascade' }),
  fieldSessionId: integer('field_session_id').references(() => telemetryFieldSessions.id, { onDelete: 'cascade' }),

  // AI draft metadata
  draftId: text('draft_id').notNull(),
  fieldId: text('field_id').notNull(),

  // Timing
  requestedAt: integer('requested_at', { mode: 'timestamp' }).notNull(),
  respondedAt: integer('responded_at', { mode: 'timestamp' }),
  responseTimeMs: integer('response_time_ms'),

  // Draft content
  prompt: text('prompt'), // What triggered the AI (field context)
  suggestedValue: text('suggested_value'), // Sanitized based on PII mode
  confidence: real('confidence'), // AI confidence score (0-1)

  // User response
  userAction: text('user_action'), // 'accepted', 'rejected', 'modified', 'ignored'
  actionedAt: integer('actioned_at', { mode: 'timestamp' }),
  timeToDecisionMs: integer('time_to_decision_ms'),

  // Modifications (if user modified suggestion)
  finalValue: text('final_value'), // Sanitized based on PII mode
  editDistance: integer('edit_distance'), // Levenshtein distance from suggestion
}, (table) => ({
  sessionIdx: index('idx_telemetry_ai_session').on(table.sessionId),
  participantIdx: index('idx_telemetry_ai_participant').on(table.participantId),
  draftIdx: index('idx_telemetry_ai_draft').on(table.draftId),
  fieldIdx: index('idx_telemetry_ai_field').on(table.fieldId),
  timestampIdx: index('idx_telemetry_ai_timestamp').on(table.requestedAt),
}));

// ============================================================================
// 9. Conflict Events - Field lock conflicts and resolutions
// ============================================================================
export const telemetryConflictEvents = sqliteTable('telemetry_conflict_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => telemetrySessions.id, { onDelete: 'cascade' }),

  // Conflict metadata
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  fieldId: text('field_id').notNull(),

  // Participants involved
  requestingParticipantId: integer('requesting_participant_id').notNull().references(() => telemetryParticipants.id, { onDelete: 'cascade' }),
  lockHolderParticipantId: integer('lock_holder_participant_id').references(() => telemetryParticipants.id, { onDelete: 'cascade' }),

  // Conflict details
  conflictType: text('conflict_type').notNull(), // 'lock_denied', 'force_takeover', 'simultaneous_edit'

  // Resolution
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  resolutionTimeMs: integer('resolution_time_ms'),
  resolutionMethod: text('resolution_method'), // 'user_yielded', 'lock_released', 'timeout'
}, (table) => ({
  sessionIdx: index('idx_telemetry_conflict_session').on(table.sessionId),
  fieldIdx: index('idx_telemetry_conflict_field').on(table.fieldId),
  timestampIdx: index('idx_telemetry_conflict_timestamp').on(table.timestamp),
}));

// ============================================================================
// 10. Performance Metrics - Client-side performance samples
// ============================================================================
export const telemetryPerformanceMetrics = sqliteTable('telemetry_performance_metrics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => telemetrySessions.id, { onDelete: 'cascade' }),
  participantId: integer('participant_id').notNull().references(() => telemetryParticipants.id, { onDelete: 'cascade' }),

  // Sampling metadata
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),

  // Performance metrics (from Performance API)
  memoryUsedMB: real('memory_used_mb'),
  memoryLimitMB: real('memory_limit_mb'),

  // Network performance
  wsLatencyMs: integer('ws_latency_ms'), // WebSocket round-trip time
  wsMessageQueueSize: integer('ws_message_queue_size'),

  // Rendering performance
  fps: integer('fps'), // Frames per second
  longTaskCount: integer('long_task_count'), // Tasks > 50ms in past 10s

  // Custom metrics
  customMetrics: text('custom_metrics'), // JSON for extensibility
}, (table) => ({
  sessionIdx: index('idx_telemetry_performance_session').on(table.sessionId),
  participantIdx: index('idx_telemetry_performance_participant').on(table.participantId),
  timestampIdx: index('idx_telemetry_performance_timestamp').on(table.timestamp),
}));

// ============================================================================
// 11. Collaborative Field Edits - Track multi-user field editing patterns
// ============================================================================
export const telemetryCollaborativeEdits = sqliteTable('telemetry_collaborative_edits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => telemetrySessions.id, { onDelete: 'cascade' }),
  fieldId: text('field_id').notNull(),

  // Edit metadata
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  participantId: integer('participant_id').notNull().references(() => telemetryParticipants.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(), // Denormalized for easy querying
  userName: text('user_name').notNull(), // Denormalized for easy querying

  // Edit details
  valueBefore: text('value_before'), // Sanitized based on PII mode
  valueAfter: text('value_after'), // Sanitized based on PII mode
  editType: text('edit_type').notNull(), // 'new', 'extend', 'replace', 'fix_error', 'introduce_error'

  // Previous editor (for collaborative analysis)
  previousParticipantId: integer('previous_participant_id').references(() => telemetryParticipants.id, { onDelete: 'set null' }),
  previousUserId: text('previous_user_id'),
  previousUserName: text('previous_user_name'),

  // Error context
  hadValidationError: integer('had_validation_error', { mode: 'boolean' }).notNull().default(false),
  fixedValidationError: integer('fixed_validation_error', { mode: 'boolean' }).notNull().default(false),
  introducedValidationError: integer('introduced_validation_error', { mode: 'boolean' }).notNull().default(false),

  // Metrics
  editDurationMs: integer('edit_duration_ms'), // Time since last edit on this field
  valueChangePercent: integer('value_change_percent'), // % of characters changed (0-100)
}, (table) => ({
  sessionIdx: index('idx_telemetry_collab_edits_session').on(table.sessionId),
  fieldIdx: index('idx_telemetry_collab_edits_field').on(table.fieldId),
  participantIdx: index('idx_telemetry_collab_edits_participant').on(table.participantId),
  sessionFieldIdx: index('idx_telemetry_collab_edits_session_field').on(table.sessionId, table.fieldId),
  timestampIdx: index('idx_telemetry_collab_edits_timestamp').on(table.timestamp),
}));

// ============================================================================
// Type Exports
// ============================================================================

export type TelemetrySession = typeof telemetrySessions.$inferSelect;
export type NewTelemetrySession = typeof telemetrySessions.$inferInsert;

export type TelemetryParticipant = typeof telemetryParticipants.$inferSelect;
export type NewTelemetryParticipant = typeof telemetryParticipants.$inferInsert;

export type TelemetryInteraction = typeof telemetryInteractions.$inferSelect;
export type NewTelemetryInteraction = typeof telemetryInteractions.$inferInsert;

export type TelemetryFieldSession = typeof telemetryFieldSessions.$inferSelect;
export type NewTelemetryFieldSession = typeof telemetryFieldSessions.$inferInsert;

export type TelemetryKeystrokeSequence = typeof telemetryKeystrokeSequences.$inferSelect;
export type NewTelemetryKeystrokeSequence = typeof telemetryKeystrokeSequences.$inferInsert;

export type TelemetryCursorMovement = typeof telemetryCursorMovements.$inferSelect;
export type NewTelemetryCursorMovement = typeof telemetryCursorMovements.$inferInsert;

export type TelemetryValidationEvent = typeof telemetryValidationEvents.$inferSelect;
export type NewTelemetryValidationEvent = typeof telemetryValidationEvents.$inferInsert;

export type TelemetryAiInteraction = typeof telemetryAiInteractions.$inferSelect;
export type NewTelemetryAiInteraction = typeof telemetryAiInteractions.$inferInsert;

export type TelemetryConflictEvent = typeof telemetryConflictEvents.$inferSelect;
export type NewTelemetryConflictEvent = typeof telemetryConflictEvents.$inferInsert;

export type TelemetryPerformanceMetric = typeof telemetryPerformanceMetrics.$inferSelect;
export type NewTelemetryPerformanceMetric = typeof telemetryPerformanceMetrics.$inferInsert;

export type TelemetryCollaborativeEdit = typeof telemetryCollaborativeEdits.$inferSelect;
export type NewTelemetryCollaborativeEdit = typeof telemetryCollaborativeEdits.$inferInsert;

// ============================================================================
// 12. Action Sequences - Grouped keystroke sequences into complete actions
// ============================================================================
export const telemetryActionSequences = sqliteTable('telemetry_action_sequences', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().references(() => telemetrySessions.id, { onDelete: 'cascade' }),
  submissionCycleId: text('submission_cycle_id'), // Links edits to specific form submission cycles
  fieldId: text('field_id').notNull(),

  // Action metadata
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(), // When action started
  completedAt: integer('completed_at', { mode: 'timestamp' }), // When action completed
  durationMs: integer('duration_ms'), // Total duration of the complete action sequence

  // User who performed the action
  participantId: integer('participant_id').notNull().references(() => telemetryParticipants.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull(),

  // Action details
  valueBefore: text('value_before'), // Initial value when action started
  valueAfter: text('value_after'), // Final value when action completed
  actionType: text('action_type').notNull(), // 'new', 'extend', 'replace', 'shorten', 'clear'

  // Previous editor (for collaborative analysis)
  previousParticipantId: integer('previous_participant_id').references(() => telemetryParticipants.id, { onDelete: 'set null' }),
  previousUserId: text('previous_user_id'),
  previousUserName: text('previous_user_name'),

  // Error tracking
  hadValidationError: integer('had_validation_error', { mode: 'boolean' }).notNull().default(false),
  fixedValidationError: integer('fixed_validation_error', { mode: 'boolean' }).notNull().default(false),
  introducedValidationError: integer('introduced_validation_error', { mode: 'boolean' }).notNull().default(false),

  // Metrics
  keystrokeCount: integer('keystroke_count').notNull().default(0), // Number of individual edits in this sequence
  valueChangePercent: integer('value_change_percent'), // % of characters changed (0-100)
}, (table) => ({
  sessionIdx: index('idx_telemetry_action_sequences_session').on(table.sessionId),
  submissionCycleIdx: index('idx_telemetry_action_sequences_cycle').on(table.submissionCycleId),
  fieldIdx: index('idx_telemetry_action_sequences_field').on(table.fieldId),
  participantIdx: index('idx_telemetry_action_sequences_participant').on(table.participantId),
  timestampIdx: index('idx_telemetry_action_sequences_timestamp').on(table.timestamp),
}));

// ============================================================================
// 13. Submission Cycles - Track individual form submission instances
// ============================================================================
export const telemetrySubmissionCycles = sqliteTable('telemetry_submission_cycles', {
  id: text('id').primaryKey(), // UUID for submission cycle
  sessionId: text('session_id').notNull().references(() => telemetrySessions.id, { onDelete: 'cascade' }),

  // Cycle timing
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(), // When first field was edited in this cycle
  submittedAt: integer('submitted_at', { mode: 'timestamp' }), // When form was submitted
  durationMs: integer('duration_ms'), // Time from first edit to submission

  // Who submitted
  submittedBy: text('submitted_by'), // userId who submitted the form
  submittedByName: text('submitted_by_name'), // userName who submitted

  // Metrics
  totalParticipants: integer('total_participants').notNull().default(0), // How many users contributed
  totalFields: integer('total_fields').notNull().default(0), // How many fields were edited
  totalActions: integer('total_actions').notNull().default(0), // Total action sequences

  // Action breakdown
  actionsNew: integer('actions_new').notNull().default(0),
  actionsExtend: integer('actions_extend').notNull().default(0),
  actionsReplace: integer('actions_replace').notNull().default(0),
  actionsShorten: integer('actions_shorten').notNull().default(0),

  // Error tracking
  errorsFixed: integer('errors_fixed').notNull().default(0),
  errorsBroke: integer('errors_broke').notNull().default(0),

  // Quality metrics
  accuracy: real('accuracy'), // % of fields without errors (0-100)
  collaborationScore: real('collaboration_score'), // Weighted quality metric (0-100)
}, (table) => ({
  sessionIdx: index('idx_telemetry_submission_cycles_session').on(table.sessionId),
  timestampIdx: index('idx_telemetry_submission_cycles_timestamp').on(table.startedAt),
  submittedAtIdx: index('idx_telemetry_submission_cycles_submitted').on(table.submittedAt),
}));

export type TelemetryActionSequence = typeof telemetryActionSequences.$inferSelect;
export type NewTelemetryActionSequence = typeof telemetryActionSequences.$inferInsert;

export type TelemetrySubmissionCycle = typeof telemetrySubmissionCycles.$inferSelect;
export type NewTelemetrySubmissionCycle = typeof telemetrySubmissionCycles.$inferInsert;
