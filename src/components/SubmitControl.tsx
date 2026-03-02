/**
 * SubmitControl
 *
 * A smart submit button that integrates with CollaborationHarness.
 *
 * In 'any' mode: renders a standard submit button
 * In 'consensus' mode: shows "Mark Ready" / "Unmark Ready" buttons and a list
 * of who's ready. Only submits when all peers are ready.
 */

import { useCollaboration } from './CollaborationHarness'
import { useEffect, useRef } from 'react'

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

interface SubmitControlProps {
  /** Called when the form should be submitted (all peers ready in consensus mode) */
  onSubmit?: () => void
  /** Button text in 'any' mode. Defaults to "Submit" */
  submitText?: string
  /** Additional className for the button */
  className?: string
}

export function SubmitControl({
  onSubmit,
  submitText = 'Submit',
  className = 'w-full rounded-lg bg-violet-600 py-3 font-semibold text-white shadow hover:bg-violet-700 transition-colors',
}: SubmitControlProps) {
  const {
    connected,
    userId,
    submitMode,
    users,
    readyStates,
    markReady,
    unmarkReady,
    sendFormSubmit,
  } = useCollaboration()

  const isReady = readyStates[userId] ?? false
  const userList = Object.values(users)
  const readyCount = Object.values(readyStates).filter(Boolean).length
  const allReady = userList.length > 0 && readyCount === userList.length

  // Track previous allReady state to detect when it transitions to true
  const prevAllReady = useRef(false)

  // Auto-submit in consensus mode when everyone becomes ready
  useEffect(() => {
    if (submitMode === 'consensus' && allReady && !prevAllReady.current && connected) {
      // All peers just became ready - broadcast submit and trigger form submit
      const timer = setTimeout(() => {
        // Send FORM_SUBMITTED message to all peers
        sendFormSubmit()

        // Trigger actual form submit
        onSubmit?.()
        const form = document.querySelector('form')
        if (form && !onSubmit) {
          form.requestSubmit()
        }
      }, 300) // Brief delay so users see the "all ready" state

      return () => clearTimeout(timer)
    }
    prevAllReady.current = allReady
  }, [allReady, submitMode, connected, onSubmit, sendFormSubmit])

  if (!connected) {
    // Offline fallback – just a regular submit button
    return (
      <button type="submit" className={className} onClick={onSubmit}>
        {submitText}
      </button>
    )
  }

  if (submitMode === 'any') {
    return (
      <button type="submit" className={className} onClick={onSubmit}>
        {submitText}
      </button>
    )
  }

  // Consensus mode
  return (
    <div className="space-y-3">
      {/* Ready status list - fixed height to prevent UI jank */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4" style={{ minHeight: '120px' }}>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
          Ready to submit ({readyCount}/{userList.length})
        </div>
        <div className="flex flex-wrap gap-2">
          {userList.map((user) => {
            const ready = readyStates[user.userId] ?? false
            const initials = getInitials(user.name)
            return (
              <div
                key={user.userId}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm"
                style={{
                  backgroundColor: ready ? `${user.color}20` : '#fff',
                  borderColor: ready ? user.color : '#d1d5db',
                  color: ready ? user.color : '#6b7280',
                }}
                title={user.name} // Show full name on hover
              >
                <span
                  className="inline-flex items-center justify-center h-5 w-5 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: user.color,
                    color: '#fff',
                  }}
                >
                  {initials}
                </span>
                {ready && <span className="text-xs">✓</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Ready / Unready button */}
      {!allReady && (
        <button
          type="button"
          onClick={isReady ? unmarkReady : markReady}
          className={`w-full rounded-lg py-3 font-semibold transition-colors ${
            isReady
              ? 'border-2 border-violet-600 bg-white text-violet-600 hover:bg-violet-50'
              : 'bg-violet-600 text-white shadow hover:bg-violet-700'
          }`}
        >
          {isReady ? "I'm ready ✓ (click to unmark)" : 'Mark me as ready'}
        </button>
      )}

      {/* Auto-submit indicator (shown when all ready) */}
      {allReady && (
        <div className="w-full rounded-lg bg-green-600 py-3 font-semibold text-white shadow text-center animate-pulse">
          ✓ All ready! Auto-submitting...
        </div>
      )}
    </div>
  )
}
