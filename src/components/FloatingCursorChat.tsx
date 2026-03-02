/**
 * FloatingCursorChat
 *
 * A floating panel containing:
 * - Cursor message input field
 * - Settings gear icon button
 *
 * Can be positioned in any corner of the screen via the `position` prop.
 */

import { useCollaboration } from './CollaborationHarness'
import { useEffect, useState } from 'react'

export type FloatingChatPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

interface FloatingCursorChatProps {
  /** Corner positioning */
  position?: FloatingChatPosition
  /** Callback when settings button is clicked */
  onSettingsClick: () => void
}

export function FloatingCursorChat({
  position = 'bottom-right',
  onSettingsClick,
}: FloatingCursorChatProps) {
  const { cursorMessage, setCursorMessage } = useCollaboration()
  const [localMessage, setLocalMessage] = useState(cursorMessage)

  useEffect(() => {
    setLocalMessage(cursorMessage)
  }, [cursorMessage])

  function commitMessage() {
    setCursorMessage(localMessage)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      commitMessage()
      e.currentTarget.blur()
    }
  }

  // Determine position classes based on corner
  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  }[position]

  return (
    <div
      className={`fixed ${positionClasses} z-40 flex items-center gap-2 rounded-lg border border-gray-200 bg-white/90 p-2 shadow-lg backdrop-blur-sm transition-all`}
    >
      {/* Cursor message input */}
      <input
        type="text"
        value={localMessage}
        onChange={(e) => setLocalMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commitMessage}
        placeholder="Cursor chat..."
        className="w-40 rounded border border-gray-300 bg-white px-2 py-1 text-xs focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-200 transition"
        title="Type a message to show next to your cursor, press Enter to send"
      />

      {/* Settings gear button */}
      <button
        onClick={onSettingsClick}
        className="rounded p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition"
        title="Open settings"
        aria-label="Settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
        </svg>
      </button>
    </div>
  )
}
