import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useTelemetry } from '../contexts/TelemetryContext';

/**
 * Telemetry Event Capture
 *
 * Captures DOM events from form fields without modifying the existing harness.
 * Uses event delegation with capture phase to intercept all events.
 */

export interface TelemetryEventCaptureProps {
  children: ReactNode;
}

export function TelemetryEventCapture({ children }: TelemetryEventCaptureProps) {
  const {
    capture,
    startFieldSession,
    endFieldSession,
    updateFieldSession,
    trackValidationError,
    config,
  } = useTelemetry();

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!config?.enabled) return;

    const container = containerRef.current;
    if (!container) return;

    // ========================================================================
    // Field Input Tracking
    // ========================================================================
    function onInput(e: Event) {
      const target = e.target as HTMLInputElement;
      if (!isFormField(target)) return;

      const fieldId = getFieldId(target);
      const inputEvent = e as InputEvent;

      // Track keystroke if enabled
      if (config.captureKeystrokes && inputEvent.data) {
        capture('field_input', {
          fieldId,
          key: inputEvent.data,
          valueLength: target.value.length,
        });

        // Update field session keystroke count
        updateFieldSession(fieldId, {
          keystrokeCount: (getKeystrokeCount(fieldId) || 0) + 1,
        });
      }

      // Track paste events
      if (inputEvent.inputType === 'insertFromPaste') {
        capture('field_paste', {
          fieldId,
          pastedLength: inputEvent.data?.length || 0,
        });

        updateFieldSession(fieldId, {
          pasteCount: (getPasteCount(fieldId) || 0) + 1,
        });
      }
    }

    // ========================================================================
    // Field Focus Tracking
    // ========================================================================
    function onFocus(e: FocusEvent) {
      const target = e.target as HTMLElement;
      if (!isFormField(target)) return;

      const fieldId = getFieldId(target);
      const fieldType = target.getAttribute('type') || 'text';
      const fieldLabel = getFieldLabel(target);
      const aiIntent = target.getAttribute('data-ai-intent') || undefined;

      startFieldSession(fieldId, {
        fieldType,
        fieldLabel,
        aiIntent,
        initialValue: (target as HTMLInputElement).value,
      });
    }

    // ========================================================================
    // Field Blur Tracking
    // ========================================================================
    function onBlur(e: FocusEvent) {
      const target = e.target as HTMLInputElement;
      if (!isFormField(target)) return;

      const fieldId = getFieldId(target);
      endFieldSession(fieldId, target.value);
    }

    // ========================================================================
    // Validation Error Tracking
    // ========================================================================
    function onInvalid(e: Event) {
      // DON'T call e.preventDefault() - we want the CollaborationHarness
      // to handle validation errors and show the error notification UI

      const target = e.target as HTMLInputElement;
      if (!isFormField(target)) return;

      const fieldId = getFieldId(target);
      const errorType = getValidationErrorType(target);
      const errorMessage = target.validationMessage;

      trackValidationError(fieldId, errorType, errorMessage, target.value);
    }

    // ========================================================================
    // Change Tracking (for edit count)
    // ========================================================================
    function onChange(e: Event) {
      const target = e.target as HTMLInputElement;
      if (!isFormField(target)) return;

      const fieldId = getFieldId(target);

      updateFieldSession(fieldId, {
        editCount: (getEditCount(fieldId) || 0) + 1,
      });

      capture('field_change', {
        fieldId,
        valueLength: target.value.length,
      });
    }

    // ========================================================================
    // Click Tracking
    // ========================================================================
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;

      capture('click', {
        x: e.clientX,
        y: e.clientY,
        targetType: target.tagName.toLowerCase(),
        targetId: target.id || undefined,
        targetClass: target.className || undefined,
      });
    }

    // ========================================================================
    // Cursor Movement Tracking (if enabled)
    // ========================================================================
    let cursorMoveTimeout: ReturnType<typeof setTimeout> | null = null;
    function onMouseMove(e: MouseEvent) {
      if (!config.captureCursors) return;

      // Throttle to 200ms
      if (cursorMoveTimeout) return;

      cursorMoveTimeout = setTimeout(() => {
        cursorMoveTimeout = null;
      }, 200);

      const activeField = document.activeElement;
      const activeFieldId =
        activeField && isFormField(activeField)
          ? getFieldId(activeField as HTMLElement)
          : undefined;

      capture('cursor_move', {
        x: e.clientX,
        y: e.clientY,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        activeFieldId,
      });
    }

    // ========================================================================
    // Scroll Tracking (throttled)
    // ========================================================================
    let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
    function onScroll() {
      if (scrollTimeout) return;

      scrollTimeout = setTimeout(() => {
        scrollTimeout = null;

        capture('scroll', {
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        });
      }, 500);
    }

    // ========================================================================
    // Add Event Listeners (capture phase for delegation)
    // ========================================================================
    container.addEventListener('input', onInput, true);
    container.addEventListener('focusin', onFocus, true);
    container.addEventListener('focusout', onBlur, true);
    container.addEventListener('invalid', onInvalid, true);
    container.addEventListener('change', onChange, true);
    container.addEventListener('click', onClick, true);

    if (config.captureCursors) {
      container.addEventListener('mousemove', onMouseMove, true);
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    // ========================================================================
    // Cleanup
    // ========================================================================
    return () => {
      container.removeEventListener('input', onInput, true);
      container.removeEventListener('focusin', onFocus, true);
      container.removeEventListener('focusout', onBlur, true);
      container.removeEventListener('invalid', onInvalid, true);
      container.removeEventListener('change', onChange, true);
      container.removeEventListener('click', onClick, true);
      container.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('scroll', onScroll);

      if (cursorMoveTimeout) clearTimeout(cursorMoveTimeout);
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, [
    capture,
    startFieldSession,
    endFieldSession,
    updateFieldSession,
    trackValidationError,
    config,
  ]);

  return (
    <div ref={containerRef} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if element is a form field
 */
function isFormField(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

/**
 * Get field identifier
 */
function getFieldId(element: HTMLElement): string {
  return element.getAttribute('name') || element.id || `field_${Date.now()}`;
}

/**
 * Get field label
 */
function getFieldLabel(element: HTMLElement): string | undefined {
  const id = element.id;
  if (!id) return undefined;

  const label = document.querySelector(`label[for="${id}"]`);
  return label?.textContent?.trim() || undefined;
}

/**
 * Get validation error type
 */
function getValidationErrorType(input: HTMLInputElement): string {
  if (input.validity.valueMissing) return 'required';
  if (input.validity.typeMismatch) return 'format';
  if (input.validity.patternMismatch) return 'pattern';
  if (input.validity.rangeUnderflow || input.validity.rangeOverflow) return 'range';
  if (input.validity.tooShort || input.validity.tooLong) return 'length';
  return 'custom';
}

/**
 * Temporary storage for field session data (for updateFieldSession helper)
 * This is a simple in-memory store; the actual data is managed by telemetry-client.ts
 */
const fieldSessionData = new Map<string, any>();

function getKeystrokeCount(fieldId: string): number | undefined {
  return fieldSessionData.get(fieldId)?.keystrokeCount;
}

function getPasteCount(fieldId: string): number | undefined {
  return fieldSessionData.get(fieldId)?.pasteCount;
}

function getEditCount(fieldId: string): number | undefined {
  return fieldSessionData.get(fieldId)?.editCount;
}
