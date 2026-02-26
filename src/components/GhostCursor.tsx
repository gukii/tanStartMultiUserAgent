import { useLayoutEffect, useState, type RefObject } from 'react'
import type { CursorState } from '../types/collaboration'

interface GhostCursorProps {
  cursor: CursorState
  containerRef: RefObject<HTMLElement | null>
}

/**
 * Extract initials from a name (e.g., "Chris Santa" → "CS")
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Renders a remote user's cursor as a fixed-position SVG pointer + name badge.
 *
 * Coordinate strategy (per spec):
 *  1. If the remote cursor has `activeField` + relative coords, we look up that
 *     field in the LOCAL DOM via getBoundingClientRect() and position the cursor
 *     inside it proportionally. This keeps cursors aligned across different
 *     screen sizes / zoom levels.
 *  2. Fallback: position using container-relative percentages.
 *
 * A ResizeObserver + scroll listener keep the position correct when the layout
 * changes after the cursor was last broadcast.
 */
export function GhostCursor({ cursor, containerRef }: GhostCursorProps) {
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const [isStale, setIsStale] = useState(false)

  // Detect stale cursors (no movement for 10 seconds)
  useLayoutEffect(() => {
    const age = Date.now() - cursor.lastSeen
    setIsStale(age > 10000)

    const timer = setTimeout(() => {
      setIsStale(true)
    }, Math.max(0, 10000 - age))

    return () => clearTimeout(timer)
  }, [cursor.lastSeen])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    function recompute() {
      if (!container) return
      const cRect = container.getBoundingClientRect()

      let left: number
      let top: number

      if (
        cursor.activeField &&
        cursor.fieldRelativeX !== undefined &&
        cursor.fieldRelativeY !== undefined
      ) {
        // Prefer field-relative positioning (prioritize name over id)
        const fieldEl = container.querySelector<HTMLElement>(
          `[name="${CSS.escape(cursor.activeField)}"], [id="${CSS.escape(cursor.activeField)}"]`,
        )
        if (fieldEl) {
          const fRect = fieldEl.getBoundingClientRect()
          left = fRect.left + cursor.fieldRelativeX * fRect.width
          top = fRect.top + cursor.fieldRelativeY * fRect.height
        } else {
          // Field not yet rendered on this client – fall back to container %
          left = cRect.left + cursor.x * cRect.width
          top = cRect.top + cursor.y * cRect.height
        }
      } else {
        left = cRect.left + cursor.x * cRect.width
        top = cRect.top + cursor.y * cRect.height
      }

      setPos({ left, top })
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
  }, [cursor, containerRef])

  const initials = getInitials(cursor.name)
  const hasMessage = cursor.message && cursor.message.trim().length > 0
  const showMessage = hasMessage // Always show message when it exists

  return (
    <div
      className="ghost-cursor"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        pointerEvents: 'none',
        zIndex: 9999,
        opacity: isStale ? 0.3 : 1,
        transition: 'opacity 500ms ease-out',
      }}
      aria-hidden="true"
    >
      {/* Arrow SVG */}
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        style={{ display: 'block', transform: 'translate(-3px, -3px)' }}
      >
        <path
          d="M1 1L1 15L5.5 10.5L8.5 17L11 16L8 9.5L14 9.5L1 1Z"
          fill={cursor.color}
          stroke="white"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
      {/* Initials badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 2,
          marginLeft: 10,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: cursor.color,
            color: '#fff',
            padding: '3px 6px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 700,
            fontFamily: 'system-ui, sans-serif',
            lineHeight: 1,
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
            minWidth: 24,
          }}
        >
          {initials}
        </span>
        {/* Coaching message (only when not in a field) */}
        {showMessage && (
          <span
            style={{
              display: 'inline-block',
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'system-ui, sans-serif',
              whiteSpace: 'nowrap',
              maxWidth: 300,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            {cursor.message}
          </span>
        )}
      </div>
    </div>
  )
}
