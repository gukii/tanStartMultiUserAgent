import { useLayoutEffect, useState, type RefObject } from 'react'
import type { DraftSuggestion, FieldSchema } from '../types/collaboration'

interface AISuggestionBubbleProps {
  draft: DraftSuggestion
  schema: FieldSchema | undefined
  containerRef: RefObject<HTMLElement | null>
  onAccept: (fieldId: string) => void
  onReject: (fieldId: string) => void
}

/**
 * A tooltip-style bubble that appears below a form field when an AI Agent
 * has proposed a draft value. The human must Accept or Reject before the
 * value is committed.
 *
 * Rendered via `pointer-events: auto` so the buttons remain clickable even
 * though the surrounding cursor overlay is `pointer-events: none`.
 */
export function AISuggestionBubble({
  draft,
  schema,
  containerRef,
  onAccept,
  onReject,
}: AISuggestionBubbleProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    function recompute() {
      if (!container) return
      // Prioritize name over id (consistent with field sync logic)
      const fieldEl = container.querySelector<HTMLElement>(
        `[name="${CSS.escape(draft.fieldId)}"], [id="${CSS.escape(draft.fieldId)}"]`,
      )
      if (!fieldEl) return
      const rect = fieldEl.getBoundingClientRect()
      setPos({
        // Position below the field, accounting for page scroll
        top: rect.bottom + window.scrollY + 6,
        left: rect.left + window.scrollX,
      })
    }

    recompute()

    const ro = new ResizeObserver(recompute)
    ro.observe(container)
    window.addEventListener('scroll', recompute, { passive: true })
    window.addEventListener('resize', recompute, { passive: true })

    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', recompute)
      window.removeEventListener('resize', recompute)
    }
  }, [draft.fieldId, containerRef])

  if (!pos) return null

  const fieldLabel = schema?.label || schema?.placeholder || draft.fieldId

  return (
    <div
      role="dialog"
      aria-label={`AI suggestion for ${fieldLabel}`}
      style={{
        position: 'absolute',
        top: pos.top,
        left: pos.left,
        zIndex: 10000,
        pointerEvents: 'auto',
        backgroundColor: '#fff',
        border: '2px solid #8b5cf6',
        borderRadius: 10,
        padding: '10px 14px',
        boxShadow: '0 6px 20px rgba(109, 40, 217, 0.2)',
        maxWidth: 320,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 6,
          color: '#6d28d9',
          fontWeight: 700,
        }}
      >
        <span style={{ fontSize: 16 }}>🤖</span>
        <span>{draft.source} suggests</span>
        {fieldLabel && (
          <span style={{ fontWeight: 400, color: '#7c3aed', fontSize: 11 }}>
            for &ldquo;{fieldLabel}&rdquo;
          </span>
        )}
      </div>

      {/* Suggested value */}
      <div
        style={{
          backgroundColor: '#f5f3ff',
          border: '1px solid #ddd6fe',
          borderRadius: 5,
          padding: '4px 9px',
          fontFamily: 'monospace',
          color: '#4c1d95',
          marginBottom: 6,
          wordBreak: 'break-word',
        }}
      >
        &ldquo;{draft.value}&rdquo;
      </div>

      {/* Optional reasoning */}
      {draft.reason && (
        <p style={{ color: '#6b7280', fontSize: 11, marginBottom: 8, marginTop: 0 }}>
          {draft.reason}
        </p>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => onAccept(draft.fieldId)}
          style={{
            backgroundColor: '#7c3aed',
            color: '#fff',
            border: 'none',
            padding: '5px 12px',
            borderRadius: 5,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          Accept
        </button>
        <button
          onClick={() => onReject(draft.fieldId)}
          style={{
            backgroundColor: '#f3f4f6',
            color: '#374151',
            border: '1px solid #d1d5db',
            padding: '5px 12px',
            borderRadius: 5,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
