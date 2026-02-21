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
  } = useCollaboration()

  const isReady = readyStates[userId] ?? false
  const userList = Object.values(users)
  const readyCount = Object.values(readyStates).filter(Boolean).length
  const allReady = userList.length > 0 && readyCount === userList.length

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
      {/* Ready status list */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
          Ready to submit ({readyCount}/{userList.length})
        </div>
        <div className="flex flex-wrap gap-2">
          {userList.map((user) => {
            const ready = readyStates[user.userId] ?? false
            return (
              <div
                key={user.userId}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm"
                style={{
                  backgroundColor: ready ? `${user.color}20` : '#fff',
                  borderColor: ready ? user.color : '#d1d5db',
                  color: ready ? user.color : '#6b7280',
                }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: ready ? user.color : '#d1d5db' }}
                />
                <span className="font-medium">{user.name}</span>
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

      {/* Submit button (only shown when all ready) */}
      {allReady && (
        <button
          type="submit"
          className="w-full rounded-lg bg-green-600 py-3 font-semibold text-white shadow hover:bg-green-700 transition-colors"
          onClick={onSubmit}
        >
          Submit (all ready!) ✓
        </button>
      )}
    </div>
  )
}
