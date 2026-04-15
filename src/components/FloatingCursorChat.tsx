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
  /** Whether floating AI help mode is enabled */
  aiHelpFloatingEnabled?: boolean
}

export function FloatingCursorChat({
  position = 'bottom-right',
  onSettingsClick,
  aiHelpFloatingEnabled = false,
}: FloatingCursorChatProps) {
  const { cursorMessage, setCursorMessage, touchCursorMode, setTouchCursorMode, submitMode, connected } = useCollaboration()
  const [localMessage, setLocalMessage] = useState(cursorMessage)
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [aiHelpSelectMode, setAIHelpSelectMode] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [fillAllStatus, setFillAllStatus] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      ;(e.currentTarget as HTMLElement).blur()

      // Return focus to previous element for fluid chat feeling
      if (previousFocusRef.current) {
        previousFocusRef.current.focus()
        previousFocusRef.current = null
      }
    } else if (e.key === 'Escape') {
      // Cancel without committing
      setLocalMessage(cursorMessage)
      ;(e.currentTarget as HTMLElement).blur()

      // Return focus to previous element
      if (previousFocusRef.current) {
        previousFocusRef.current.focus()
        previousFocusRef.current = null
      }
    }
  }

  // Listen for fill-all completion status
  useEffect(() => {
    function handleFillAllComplete(e: Event) {
      const customEvent = e as CustomEvent<{ count: number }>
      const count = customEvent.detail?.count || 0
      const message = count > 0 ? `✓ ${count} field${count > 1 ? 's' : ''} filled` : 'No empty fields'
      setFillAllStatus(message)
      setTimeout(() => setFillAllStatus(''), 3000) // Clear after 3s
    }

    window.addEventListener('ai-help-fill-all-complete', handleFillAllComplete as EventListener)

    return () => {
      window.removeEventListener('ai-help-fill-all-complete', handleFillAllComplete as EventListener)
    }
  }, [])

  // AI Help button handlers
  function handleAIHelpStart(_e: React.MouseEvent | React.TouchEvent) {
    // Start long-press timer (800ms = long press triggers "fill all")
    longPressTimerRef.current = setTimeout(() => {
      // Long press: trigger "fill all empty fields"
      console.log('[FloatingChat] Long press detected - fill all fields')
      setFillAllStatus('Filling all fields...')
      const event = new CustomEvent('ai-help-fill-all')
      window.dispatchEvent(event)
      setAIHelpSelectMode(false)
      longPressTimerRef.current = null
    }, 800)
  }

  function handleAIHelpEnd() {
    if (longPressTimerRef.current) {
      // Short press: toggle field selection mode
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
      const newMode = !aiHelpSelectMode
      setAIHelpSelectMode(newMode)

      // Show hint when entering select mode
      if (newMode) {
        setShowHint(true)
        setTimeout(() => setShowHint(false), 2000)
      }

      console.log('[FloatingChat] Short press - toggle select mode')
    }
  }

  function handleAIHelpCancel() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  // Handle AI help select mode - listen for field clicks
  useEffect(() => {
    if (!aiHelpSelectMode) {
      console.log('[FloatingChat] Select mode disabled, removing listener')
      return
    }

    console.log('[FloatingChat] Select mode enabled, adding click listener')

    function handleFieldClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      console.log('[FloatingChat] Click detected on:', target.tagName, target)

      // Ignore clicks on the floating chat controls themselves
      if (target.closest('[data-floating-chat]')) {
        console.log('[FloatingChat] Click on floating chat controls, ignoring')
        return
      }

      // Prevent default early for checkboxes/radios to stop them from toggling
      const immediateField = target.closest('input, textarea, select') as HTMLInputElement | null
      if (immediateField && (immediateField.type === 'checkbox' || immediateField.type === 'radio')) {
        e.preventDefault()
        e.stopPropagation()
        console.log('[FloatingChat] Prevented default for checkbox/radio')
      }

      // Check if clicked element is a form field
      let field = target.closest('input, textarea, select') as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null

      // Special handling for select - if clicked on option, get parent select
      if (!field && target.tagName === 'OPTION') {
        const option = target as HTMLOptionElement
        field = option.closest('select') as HTMLSelectElement | null
      }

      // If clicked inside a label (e.g., span inside label), find the label first
      if (!field) {
        const label = target.closest('label') as HTMLLabelElement | null
        if (label) {
          console.log('[FloatingChat] Click inside label:', label)
          if (label.htmlFor) {
            field = document.getElementById(label.htmlFor) as HTMLInputElement | null
          } else {
            // Label might wrap the input
            field = label.querySelector('input, textarea, select') as HTMLInputElement | null
          }
        }
      }

      console.log('[FloatingChat] Field found:', field)

      if (field) {
        // Prevent default action for this field
        e.preventDefault()
        e.stopPropagation()

        const fieldName = field.name || field.id
        const elementIndex = field.getAttribute('data-collab-field-index')
        console.log('[FloatingChat] Field selected:', fieldName, 'index:', elementIndex)

        // Dispatch event to request AI suggestion for this field
        const event = new CustomEvent('ai-help-field-selected', {
          detail: { fieldName, elementIndex: elementIndex !== null ? parseInt(elementIndex) : undefined }
        })
        console.log('[FloatingChat] Dispatching event:', event.type, event.detail)
        window.dispatchEvent(event)
        console.log('[FloatingChat] Event dispatched successfully')

        setAIHelpSelectMode(false)
        setShowHint(false)
      } else {
        console.log('[FloatingChat] No field found, click ignored')
      }
    }

    // Add click listener in capture phase to intercept before other handlers
    document.addEventListener('click', handleFieldClick, true)

    return () => {
      console.log('[FloatingChat] Removing click listener')
      document.removeEventListener('click', handleFieldClick, true)
    }
  }, [aiHelpSelectMode])

  // Determine position classes based on corner (responsive spacing)
  const positionClasses = {
    'top-left': 'top-3 left-3 sm:top-4 sm:left-4',
    'top-right': 'top-3 right-3 sm:top-4 sm:right-4',
    'bottom-left': 'bottom-3 left-3 sm:bottom-4 sm:left-4',
    'bottom-right': 'bottom-3 right-3 sm:bottom-4 sm:right-4',
  }[position]

  // Determine hint position (opposite of floating chat)
  const hintPositionClasses = {
    'top-left': 'top-16 left-3 sm:top-20 sm:left-4',
    'top-right': 'top-16 right-3 sm:top-20 sm:right-4',
    'bottom-left': 'bottom-16 left-3 sm:bottom-20 sm:left-4',
    'bottom-right': 'bottom-16 right-3 sm:bottom-20 sm:right-4',
  }[position]

  return (
    <>
      {/* Field selection mode hint (positioned opposite to floating chat, fades out after 2s) */}
      {aiHelpSelectMode && (
        <div
          className={`fixed ${hintPositionClasses} z-30 bg-yellow-100 border border-yellow-400 rounded-lg shadow-lg p-3 max-w-xs pointer-events-none transition-opacity duration-500 ${
            showHint ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <p className="text-xs sm:text-sm font-medium text-gray-900 flex items-center gap-2">
            <span className="text-base">✨</span>
            Click a field to get AI suggestion
          </p>
        </div>
      )}

      {/* Fill-all status message (shows after long-press) */}
      {fillAllStatus && (
        <div
          className={`fixed ${hintPositionClasses} z-30 rounded-lg shadow-lg p-3 max-w-xs pointer-events-none transition-opacity duration-500 ${
            fillAllStatus.includes('✓')
              ? 'bg-green-100 border border-green-400'
              : fillAllStatus.includes('Error') || fillAllStatus === 'No empty fields'
              ? 'bg-yellow-100 border border-yellow-400'
              : 'bg-blue-100 border border-blue-400'
          }`}
        >
          <p className="text-xs sm:text-sm font-medium text-gray-900">
            {fillAllStatus}
          </p>
        </div>
      )}

      {/* Subtle overlay to indicate selection mode is active - must allow clicks through */}
      {aiHelpSelectMode && (
        <div className="fixed inset-0 z-25 cursor-crosshair pointer-events-none" />
      )}

      <div
        data-floating-chat
        className={`fixed ${positionClasses} z-40 flex items-center gap-2 rounded-lg border p-2 shadow-lg backdrop-blur-sm transition-all ${
          connected
            ? 'border-violet-400 bg-violet-600'
            : 'border-gray-500 bg-gray-600'
        }`}
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

      {/* Submit mode indicator */}
      <div
        className="rounded p-1.5 text-violet-100"
        title={submitMode === 'any' ? 'Submit mode: Any peer can submit' : 'Submit mode: Consensus (all must agree)'}
      >
        <span className="text-base leading-none">
          {submitMode === 'any' ? '👤' : '👥'}
        </span>
      </div>

      {/* Cursor message input */}
      <input
        ref={inputRef}
        type="text"
        value={localMessage}
        onChange={(e) => setLocalMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commitMessage}
        placeholder={connected ? "Cursor chat... (⌘K)" : "offline"}
        disabled={!connected}
        className="w-32 rounded border border-violet-400 bg-white px-2 py-1 text-xs text-gray-900 placeholder:text-gray-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-300 transition sm:w-40 disabled:bg-gray-100 disabled:cursor-not-allowed"
        title={connected ? "Type a message to show next to your cursor. Shortcut: Cmd/Ctrl + K. Press Enter to send, Esc to cancel." : "Offline - reconnecting..."}
      />

      {/* AI Help sparkle button (only show if floating mode enabled) */}
      {import.meta.env.VITE_ENABLE_AI_AGENT === 'true' && aiHelpFloatingEnabled && (
        <button
          onMouseDown={handleAIHelpStart}
          onMouseUp={handleAIHelpEnd}
          onMouseLeave={handleAIHelpCancel}
          onTouchStart={handleAIHelpStart}
          onTouchEnd={handleAIHelpEnd}
          onTouchCancel={handleAIHelpCancel}
          className={`rounded p-1.5 transition select-none ${
            aiHelpSelectMode
              ? 'bg-yellow-400 text-gray-900 ring-2 ring-yellow-300'
              : 'text-violet-100 hover:bg-violet-500 hover:text-white'
          }`}
          title={aiHelpSelectMode ? "Click a field to get AI suggestion" : "Click: select field | Long-press: fill all"}
          aria-label="AI field help"
        >
          <span className="text-base leading-none">✨</span>
        </button>
      )}

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
    </>
  )
}
