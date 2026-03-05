import { useRef, useEffect, useCallback, RefObject } from 'react';
import { TelemetryBuffer } from './telemetry-buffer';
import type {
  TelemetryEvent,
  TelemetryConfig,
  EventType,
  EventCategory,
  FieldSessionData,
  EnvironmentData,
  PiiMode,
} from '../types/telemetry';

/**
 * Telemetry Client Hook
 *
 * Provides telemetry capture API for React components.
 * Integrates with WebSocket to send batched events to server.
 */

export interface TelemetryClientOptions extends TelemetryConfig {
  sessionId: string;
  userId: string;
  socketRef: RefObject<WebSocket | null>;
}

export interface TelemetryClient {
  capture: (eventType: EventType, data: Record<string, any>) => void;
  flush: () => void;
  startFieldSession: (fieldId: string, metadata: Partial<FieldSessionData>) => void;
  endFieldSession: (fieldId: string, finalValue?: string) => void;
  updateFieldSession: (fieldId: string, updates: Partial<FieldSessionData>) => void;
  trackValidationError: (fieldId: string, errorType: string, errorMessage: string, attemptedValue?: string) => void;
  trackDraft: (fieldId: string, draftId: string, action: 'received' | 'accepted' | 'rejected' | 'modified', data?: Record<string, any>) => void;
}

/**
 * PII sanitization utilities
 */
function sanitizeValue(value: string | undefined, piiMode: PiiMode): string | undefined {
  if (!value) return value;

  switch (piiMode) {
    case 'omit':
      return undefined;
    case 'anonymize':
      // Simple hash (in production, use crypto.subtle.digest)
      return `hash_${value.length}_${value.charCodeAt(0)}`;
    case 'capture':
    default:
      return value;
  }
}

/**
 * Collect environment data
 */
function getEnvironmentData(): EnvironmentData {
  return {
    userAgent: navigator.userAgent,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    locale: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/**
 * Hook: useTelemetryBuffer
 */
export function useTelemetryBuffer(options: TelemetryClientOptions): TelemetryClient {
  const {
    sessionId,
    userId,
    socketRef,
    enabled = true,
    sampleRate = 1.0,
    piiMode = 'anonymize',
    captureKeystrokes = true,
    captureCursors = false,
  } = options;

  const bufferRef = useRef<TelemetryBuffer | null>(null);
  const fieldSessionsRef = useRef<Map<string, FieldSessionData>>(new Map());
  const environmentRef = useRef<EnvironmentData | null>(null);

  // Initialize buffer
  useEffect(() => {
    if (!enabled) return;

    bufferRef.current = new TelemetryBuffer({
      enabled,
      sampleRate,
      onFlush: (events, sequenceId) => {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          console.warn('[Telemetry] WebSocket not ready, events will be lost');
          return;
        }

        // Send batch to server
        socket.send(
          JSON.stringify({
            type: 'TELEMETRY_BATCH',
            events,
            sequenceId,
          })
        );
      },
    });

    // Collect environment data once
    environmentRef.current = getEnvironmentData();

    return () => {
      bufferRef.current?.destroy();
    };
  }, [enabled, sampleRate, socketRef]);

  /**
   * Generic event capture
   */
  const capture = useCallback(
    (eventType: EventType, data: Record<string, any>) => {
      if (!enabled || !bufferRef.current) return;

      const eventCategory = getEventCategory(eventType);

      const event: TelemetryEvent = {
        eventType,
        eventCategory,
        timestamp: Date.now(),
        sequenceId: 0, // Will be set by buffer
        fieldId: data.fieldId,
        fieldType: data.fieldType,
        data,
      };

      bufferRef.current.capture(event);
    },
    [enabled]
  );

  /**
   * Start tracking a field session
   */
  const startFieldSession = useCallback(
    (fieldId: string, metadata: Partial<FieldSessionData>) => {
      if (!enabled) return;

      const session: FieldSessionData = {
        fieldId,
        fieldType: metadata.fieldType || 'text',
        fieldLabel: metadata.fieldLabel,
        aiIntent: metadata.aiIntent,
        focusedAt: Date.now(),
        initialValue: sanitizeValue(metadata.initialValue, piiMode),
        keystrokeCount: 0,
        pasteCount: 0,
        editCount: 0,
        validationErrors: [],
        aiDraftOffered: false,
        aiDraftAccepted: false,
      };

      fieldSessionsRef.current.set(fieldId, session);

      // Capture field_focus event
      capture('field_focus', {
        fieldId,
        fieldType: session.fieldType,
        fieldLabel: session.fieldLabel,
        aiIntent: session.aiIntent,
        initialValue: session.initialValue,
      });
    },
    [enabled, piiMode, capture]
  );

  /**
   * End tracking a field session
   */
  const endFieldSession = useCallback(
    (fieldId: string, finalValue?: string) => {
      if (!enabled) return;

      const session = fieldSessionsRef.current.get(fieldId);
      if (!session) return;

      const durationMs = Date.now() - session.focusedAt;

      // Capture field_blur event
      capture('field_blur', {
        fieldId,
        finalValue: sanitizeValue(finalValue, piiMode),
        durationMs,
        keystrokeCount: session.keystrokeCount,
        editCount: session.editCount,
        wasCompleted: !!finalValue,
      });

      fieldSessionsRef.current.delete(fieldId);
    },
    [enabled, piiMode, capture]
  );

  /**
   * Update field session data
   */
  const updateFieldSession = useCallback(
    (fieldId: string, updates: Partial<FieldSessionData>) => {
      if (!enabled) return;

      const session = fieldSessionsRef.current.get(fieldId);
      if (!session) return;

      Object.assign(session, updates);
    },
    [enabled]
  );

  /**
   * Track validation error
   */
  const trackValidationError = useCallback(
    (fieldId: string, errorType: string, errorMessage: string, attemptedValue?: string) => {
      if (!enabled) return;

      const session = fieldSessionsRef.current.get(fieldId);
      if (session) {
        session.validationErrors.push(errorType);
      }

      capture('validation_error', {
        fieldId,
        errorType,
        errorMessage,
        attemptedValue: sanitizeValue(attemptedValue, piiMode),
      });
    },
    [enabled, piiMode, capture]
  );

  /**
   * Track AI draft lifecycle
   */
  const trackDraft = useCallback(
    (
      fieldId: string,
      draftId: string,
      action: 'received' | 'accepted' | 'rejected' | 'modified',
      data?: Record<string, any>
    ) => {
      if (!enabled) return;

      const session = fieldSessionsRef.current.get(fieldId);
      if (session) {
        session.aiDraftOffered = true;
        if (action === 'accepted') {
          session.aiDraftAccepted = true;
        }
      }

      const eventType = `draft_${action}` as EventType;

      capture(eventType, {
        fieldId,
        draftId,
        suggestedValue: sanitizeValue(data?.suggestedValue, piiMode),
        finalValue: sanitizeValue(data?.finalValue, piiMode),
        ...data,
      });
    },
    [enabled, piiMode, capture]
  );

  /**
   * Manual flush
   */
  const flush = useCallback(() => {
    bufferRef.current?.flush();
  }, []);

  return {
    capture,
    flush,
    startFieldSession,
    endFieldSession,
    updateFieldSession,
    trackValidationError,
    trackDraft,
  };
}

/**
 * Map event type to category
 */
function getEventCategory(eventType: EventType): EventCategory {
  if (eventType.startsWith('cursor_')) return 'cursor';
  if (eventType.startsWith('field_')) return 'field';
  if (eventType.startsWith('validation_')) return 'validation';
  if (eventType.startsWith('draft_')) return 'draft';
  if (eventType.startsWith('lock_') || eventType.includes('takeover')) return 'conflict';
  if (eventType === 'performance_sample') return 'performance';
  if (
    eventType === 'session_start' ||
    eventType === 'session_end' ||
    eventType === 'participant_join' ||
    eventType === 'participant_leave' ||
    eventType === 'error' ||
    eventType === 'reconnect'
  ) {
    return 'system';
  }
  return 'interaction';
}
