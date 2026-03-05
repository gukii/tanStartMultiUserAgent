/**
 * Telemetry Types
 *
 * Type definitions for telemetry events, configuration, and messages.
 */

// ============================================================================
// Configuration Types
// ============================================================================

export type PiiMode = 'capture' | 'anonymize' | 'omit';

export interface TelemetryConfig {
  enabled?: boolean;
  sampleRate?: number; // 0.0 to 1.0
  piiMode?: PiiMode;
  captureKeystrokes?: boolean;
  captureCursors?: boolean;
}

// ============================================================================
// Event Types
// ============================================================================

export type EventCategory =
  | 'cursor'
  | 'field'
  | 'validation'
  | 'draft'
  | 'interaction'
  | 'conflict'
  | 'system'
  | 'performance';

export type EventType =
  // Cursor events
  | 'cursor_move'
  | 'cursor_enter_field'
  | 'cursor_leave_field'

  // Field events
  | 'field_focus'
  | 'field_blur'
  | 'field_input'
  | 'field_change'
  | 'field_paste'
  | 'field_clear'

  // Validation events
  | 'validation_error'
  | 'validation_success'
  | 'validation_correction'

  // Draft (AI) events
  | 'draft_requested'
  | 'draft_received'
  | 'draft_accepted'
  | 'draft_rejected'
  | 'draft_modified'
  | 'draft_ignored'

  // Interaction events
  | 'click'
  | 'scroll'
  | 'keypress'
  | 'submit'

  // Conflict events
  | 'lock_requested'
  | 'lock_granted'
  | 'lock_denied'
  | 'lock_released'
  | 'force_takeover'

  // System events
  | 'session_start'
  | 'session_end'
  | 'participant_join'
  | 'participant_leave'
  | 'error'
  | 'reconnect'

  // Performance events
  | 'performance_sample';

// ============================================================================
// Event Payload Types
// ============================================================================

export interface BaseTelemetryEvent {
  eventType: EventType;
  eventCategory: EventCategory;
  timestamp: number;
  sequenceId: number;
  fieldId?: string;
  fieldType?: string;
}

export interface CursorMoveEvent extends BaseTelemetryEvent {
  eventType: 'cursor_move';
  eventCategory: 'cursor';
  data: {
    x: number;
    y: number;
    scrollX: number;
    scrollY: number;
    activeFieldId?: string;
  };
}

export interface FieldFocusEvent extends BaseTelemetryEvent {
  eventType: 'field_focus';
  eventCategory: 'field';
  fieldId: string;
  data: {
    fieldType: string;
    fieldLabel?: string;
    aiIntent?: string;
    initialValue?: string;
  };
}

export interface FieldBlurEvent extends BaseTelemetryEvent {
  eventType: 'field_blur';
  eventCategory: 'field';
  fieldId: string;
  data: {
    finalValue?: string;
    durationMs: number;
    keystrokeCount: number;
    editCount: number;
    wasCompleted: boolean;
  };
}

export interface FieldInputEvent extends BaseTelemetryEvent {
  eventType: 'field_input';
  eventCategory: 'field';
  fieldId: string;
  data: {
    key?: string;
    keyCode?: string;
    interKeystrokeMs?: number;
    cursorPosition?: number;
    valueLength: number;
  };
}

export interface FieldPasteEvent extends BaseTelemetryEvent {
  eventType: 'field_paste';
  eventCategory: 'field';
  fieldId: string;
  data: {
    pastedLength: number;
    cursorPosition?: number;
  };
}

export interface ValidationErrorEvent extends BaseTelemetryEvent {
  eventType: 'validation_error';
  eventCategory: 'validation';
  fieldId: string;
  data: {
    errorType: string;
    errorMessage: string;
    attemptedValue?: string;
  };
}

export interface ValidationCorrectionEvent extends BaseTelemetryEvent {
  eventType: 'validation_correction';
  eventCategory: 'validation';
  fieldId: string;
  data: {
    errorType: string;
    resolutionTimeMs: number;
    correctedValue?: string;
  };
}

export interface DraftReceivedEvent extends BaseTelemetryEvent {
  eventType: 'draft_received';
  eventCategory: 'draft';
  fieldId: string;
  data: {
    draftId: string;
    suggestedValue?: string;
    confidence?: number;
    responseTimeMs: number;
  };
}

export interface DraftAcceptedEvent extends BaseTelemetryEvent {
  eventType: 'draft_accepted';
  eventCategory: 'draft';
  fieldId: string;
  data: {
    draftId: string;
    timeToDecisionMs: number;
  };
}

export interface DraftRejectedEvent extends BaseTelemetryEvent {
  eventType: 'draft_rejected';
  eventCategory: 'draft';
  fieldId: string;
  data: {
    draftId: string;
    timeToDecisionMs: number;
  };
}

export interface DraftModifiedEvent extends BaseTelemetryEvent {
  eventType: 'draft_modified';
  eventCategory: 'draft';
  fieldId: string;
  data: {
    draftId: string;
    suggestedValue?: string;
    finalValue?: string;
    editDistance?: number;
    timeToDecisionMs: number;
  };
}

export interface ConflictEvent extends BaseTelemetryEvent {
  eventCategory: 'conflict';
  fieldId: string;
  data: {
    conflictType: 'lock_denied' | 'force_takeover' | 'simultaneous_edit';
    lockHolderId?: string;
  };
}

export interface PerformanceSampleEvent extends BaseTelemetryEvent {
  eventType: 'performance_sample';
  eventCategory: 'performance';
  data: {
    memoryUsedMB?: number;
    memoryLimitMB?: number;
    wsLatencyMs?: number;
    wsMessageQueueSize?: number;
    fps?: number;
    longTaskCount?: number;
    customMetrics?: Record<string, any>;
  };
}

export type TelemetryEvent =
  | CursorMoveEvent
  | FieldFocusEvent
  | FieldBlurEvent
  | FieldInputEvent
  | FieldPasteEvent
  | ValidationErrorEvent
  | ValidationCorrectionEvent
  | DraftReceivedEvent
  | DraftAcceptedEvent
  | DraftRejectedEvent
  | DraftModifiedEvent
  | ConflictEvent
  | PerformanceSampleEvent
  | BaseTelemetryEvent; // Fallback for other event types

// ============================================================================
// WebSocket Message Types
// ============================================================================

export interface TelemetryBatchMessage {
  type: 'TELEMETRY_BATCH';
  events: TelemetryEvent[];
  sequenceId: number;
}

export interface TelemetryAckMessage {
  type: 'TELEMETRY_ACK';
  sequenceId: number;
  status: 'success' | 'error';
  error?: string;
}

// ============================================================================
// Field Session Tracking
// ============================================================================

export interface FieldSessionData {
  fieldId: string;
  fieldType: string;
  fieldLabel?: string;
  aiIntent?: string;
  focusedAt: number;
  initialValue?: string;
  keystrokeCount: number;
  pasteCount: number;
  editCount: number;
  lastKeystrokeTime?: number;
  validationErrors: string[];
  aiDraftOffered: boolean;
  aiDraftAccepted: boolean;
}

// ============================================================================
// Environment Data
// ============================================================================

export interface EnvironmentData {
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
  locale: string;
  timezone: string;
}
