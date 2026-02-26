/**
 * UserSettingsPanel
 *
 * Floating panel for users to change their name, color, and cursor message.
 * Triggered by clicking a settings icon or keyboard shortcut.
 */

import { useState, useEffect } from 'react'

const COLOR_PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#64748b', '#14b8a6', '#f59e0b', '#a855f7',
]

interface UserSettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  userName: string
  userColor: string
  cursorMessage: string
  updateUser: (name: string, color: string) => void
  setCursorMessage: (message: string) => void
}

export function UserSettingsPanel({
  isOpen,
  onClose,
  userName,
  userColor,
  cursorMessage,
  updateUser,
  setCursorMessage,
}: UserSettingsPanelProps) {
  const [name, setName] = useState(userName)
  const [color, setColor] = useState(userColor)
  const [message, setMessage] = useState(cursorMessage)

  // Update local state when props change
  useEffect(() => {
    setName(userName)
    setColor(userColor)
    setMessage(cursorMessage)
  }, [userName, userColor, cursorMessage])

  if (!isOpen) return null

  function handleSave() {
    if (name.trim()) {
      updateUser(name.trim(), color)
    }
    setCursorMessage(message)
    onClose()
  }

  function handleClearMessage() {
    setMessage('')
    setCursorMessage('')
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
        style={{ pointerEvents: 'auto' }}
      />

      {/* Panel */}
      <div
        className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl p-6 z-50 w-full max-w-md"
        style={{ pointerEvents: 'auto' }}
      >
        <h2 className="text-lg font-bold text-gray-900 mb-4">Your Profile</h2>

        {/* Name */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Your name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Chris Santa"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
          <p className="mt-1 text-xs text-gray-500">
            Initials will be shown next to your cursor
          </p>
        </div>

        {/* Color picker */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your color
          </label>
          <div className="grid grid-cols-6 gap-2">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-10 h-10 rounded-lg transition ${
                  color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </div>

        {/* Cursor message */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cursor message (optional)
          </label>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g., look at the eyes of this fish!"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
          <p className="mt-1 text-xs text-gray-500">
            Shown next to your cursor for coaching (hidden when typing)
          </p>
          {message && (
            <button
              onClick={handleClearMessage}
              className="mt-2 text-xs text-violet-600 hover:underline"
            >
              Clear message
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            className="flex-1 rounded-lg bg-violet-600 py-2 font-semibold text-white hover:bg-violet-700 transition"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 py-2 font-semibold text-gray-700 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}
