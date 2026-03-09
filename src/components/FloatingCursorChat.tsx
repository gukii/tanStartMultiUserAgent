/**
 * FloatingCursorChat
 *
 * A floating panel containing:
 * - Touch cursor toggle (crosshair icon)
 * - Cursor message input field
 * - Settings gear icon button
 *
 * Can be positioned in any corner of the screen via the `position` prop.
 */

import { useCollaboration } from './CollaborationHarness'
import { useEffect, useState, useRef } from 'react'

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
  const { cursorMessage, setCursorMessage, touchCursorMode, setTouchCursorMode } = useCollaboration()
  const [localMessage, setLocalMessage] = useState(cursorMessage)
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setLocalMessage(cursorMessage)
  }, [cursorMessage])

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  // Keyboard shortcut: Cmd/Ctrl + K to focus chat input
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()

        // Save the currently focused element
        if (document.activeElement instanceof HTMLElement) {
          previousFocusRef.current = document.activeElement
        }

        // Focus the chat input
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  function commitMessage() {
    setCursorMessage(localMessage)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      commitMessage()
      e.currentTarget.blur()

      // Return focus to previous element for fluid chat feeling
      if (previousFocusRef.current) {
        previousFocusRef.current.focus()
        previousFocusRef.current = null
      }
    } else if (e.key === 'Escape') {
      // Cancel without committing
      setLocalMessage(cursorMessage)
      e.currentTarget.blur()

      // Return focus to previous element
      if (previousFocusRef.current) {
        previousFocusRef.current.focus()
        previousFocusRef.current = null
      }
    }
  }

  // Determine position classes based on corner (responsive spacing)
  const positionClasses = {
    'top-left': 'top-3 left-3 sm:top-4 sm:left-4',
    'top-right': 'top-3 right-3 sm:top-4 sm:right-4',
    'bottom-left': 'bottom-3 left-3 sm:bottom-4 sm:left-4',
    'bottom-right': 'bottom-3 right-3 sm:bottom-4 sm:right-4',
  }[position]

  return (
    <div
      className={`fixed ${positionClasses} z-40 flex items-center gap-2 rounded-lg border border-violet-400 bg-violet-600 p-2 shadow-lg backdrop-blur-sm transition-all`}
    >
      {/* Touch cursor toggle with crosshair icon - only show on touch devices */}
      {isTouchDevice && (
        <button
          onClick={() => setTouchCursorMode(!touchCursorMode)}
          className={`rounded p-1.5 transition ${
            touchCursorMode
              ? 'bg-violet-500 text-white hover:bg-violet-400'
              : 'text-violet-100 hover:bg-violet-500 hover:text-white'
          }`}
          title={`Touch cursor mode: ${touchCursorMode ? 'ON' : 'OFF'}`}
          aria-label="Toggle touch cursor"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            {/* Mouse pointer icon */}
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      {/* Cursor message input */}
      <input
        ref={inputRef}
        type="text"
        value={localMessage}
        onChange={(e) => setLocalMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commitMessage}
        placeholder="Cursor chat... (⌘K)"
        className="w-32 rounded border border-violet-400 bg-white px-2 py-1 text-xs text-gray-900 placeholder:text-gray-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-300 transition sm:w-40"
        title="Type a message to show next to your cursor. Shortcut: Cmd/Ctrl + K. Press Enter to send, Esc to cancel."
      />

      {/* Settings gear button */}
      <button
        onClick={onSettingsClick}
        className="rounded p-1.5 text-violet-100 hover:bg-violet-500 hover:text-white transition"
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
