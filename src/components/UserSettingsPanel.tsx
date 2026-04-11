/**
 * UserSettingsPanel
 *
 * Floating panel for users to change their name and color.
 * Triggered by clicking a settings icon or keyboard shortcut.
 */

import { useState, useEffect } from 'react'
import type { FloatingChatPosition } from './FloatingCursorChat'

const COLOR_PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#64748b', '#14b8a6', '#f59e0b', '#a855f7',
]

export type AIHelpMode = 'keyboard' | 'rightClick' | 'floating' | 'labelEmbedded'

interface UserSettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  userName: string
  userColor: string
  floatingChatPosition: FloatingChatPosition
  submitMode: 'any' | 'consensus'
  aiHelpModes?: AIHelpMode[]
  updateUser: (name: string, color: string) => void
  setFloatingChatPosition: (position: FloatingChatPosition) => void
  setSubmitMode: (mode: 'any' | 'consensus') => void
  setAIHelpModes?: (modes: AIHelpMode[]) => void
}

export function UserSettingsPanel({
  isOpen,
  onClose,
  userName,
  userColor,
  floatingChatPosition,
  submitMode,
  aiHelpModes = [],
  updateUser,
  setFloatingChatPosition,
  setSubmitMode,
  setAIHelpModes,
}: UserSettingsPanelProps) {
  const [name, setName] = useState(userName)
  const [color, setColor] = useState(userColor)
  const [position, setPosition] = useState<FloatingChatPosition>(floatingChatPosition)
  const [mode, setMode] = useState<'any' | 'consensus'>(submitMode)
  const [helpModes, setHelpModes] = useState<AIHelpMode[]>(aiHelpModes)

  // Update local state when props change
  useEffect(() => {
    setName(userName)
    setColor(userColor)
    setPosition(floatingChatPosition)
    setMode(submitMode)
    setHelpModes(aiHelpModes)
  }, [userName, userColor, floatingChatPosition, submitMode, aiHelpModes])

  if (!isOpen) return null

  function handleSave() {
    if (name.trim()) {
      updateUser(name.trim(), color)
    }
    setFloatingChatPosition(position)
    setSubmitMode(mode)
    if (setAIHelpModes) {
      setAIHelpModes(helpModes)
    }
    onClose()
  }

  function toggleHelpMode(helpMode: AIHelpMode) {
    setHelpModes(prev =>
      prev.includes(helpMode)
        ? prev.filter(m => m !== helpMode)
        : [...prev, helpMode]
    )
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
        className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl p-3 sm:p-4 z-50 w-full max-w-md mx-3"
        style={{ pointerEvents: 'auto' }}
      >
        <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3">Settings</h2>

        {/* Name */}
        <div className="mb-2.5 sm:mb-3">
          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
            Your name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Chris Santa"
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>

        {/* Color picker */}
        <div className="mb-2.5 sm:mb-3">
          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
            Your color
          </label>
          <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
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

        {/* Submit mode */}
        <div className="mb-2.5 sm:mb-3">
          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
            Submit mode
          </label>
          <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
            <button
              onClick={() => setMode('any')}
              className={`rounded-lg border px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium transition ${
                mode === 'any'
                  ? 'border-violet-600 bg-violet-50 text-violet-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              👤 Any
            </button>
            <button
              onClick={() => setMode('consensus')}
              className={`rounded-lg border px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium transition ${
                mode === 'consensus'
                  ? 'border-violet-600 bg-violet-50 text-violet-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              👥 Consensus
            </button>
          </div>
        </div>

        {/* Floating chat position */}
        <div className="mb-2.5 sm:mb-4">
          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
            Controls position
          </label>
          <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
            <button
              onClick={() => setPosition('top-left')}
              className={`rounded-lg border px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium transition ${
                position === 'top-left'
                  ? 'border-violet-600 bg-violet-50 text-violet-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              ↖ Top Left
            </button>
            <button
              onClick={() => setPosition('top-right')}
              className={`rounded-lg border px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium transition ${
                position === 'top-right'
                  ? 'border-violet-600 bg-violet-50 text-violet-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              ↗ Top Right
            </button>
            <button
              onClick={() => setPosition('bottom-left')}
              className={`rounded-lg border px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium transition ${
                position === 'bottom-left'
                  ? 'border-violet-600 bg-violet-50 text-violet-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              ↙ Bottom Left
            </button>
            <button
              onClick={() => setPosition('bottom-right')}
              className={`rounded-lg border px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium transition ${
                position === 'bottom-right'
                  ? 'border-violet-600 bg-violet-50 text-violet-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              ↘ Bottom Right
            </button>
          </div>
        </div>

        {/* AI Help Modes (only show if VITE_ENABLE_AI_AGENT is enabled) */}
        {import.meta.env.VITE_ENABLE_AI_AGENT === 'true' && (
          <div className="mt-3 sm:mt-4">
            <label className="mb-1.5 block text-xs sm:text-sm font-semibold text-gray-700">
              AI Field Help
            </label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={helpModes.includes('floating')}
                  onChange={() => toggleHelpMode('floating')}
                  className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-2 focus:ring-violet-200"
                />
                <span className="text-xs sm:text-sm text-gray-700">
                  Floating ✨ <span className="text-gray-500">(click, then field)</span>
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={helpModes.includes('keyboard')}
                  onChange={() => toggleHelpMode('keyboard')}
                  className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-2 focus:ring-violet-200"
                />
                <span className="text-xs sm:text-sm text-gray-700">
                  Keyboard <span className="text-gray-500">(Ctrl+Space)</span>
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={helpModes.includes('rightClick')}
                  onChange={() => toggleHelpMode('rightClick')}
                  className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-2 focus:ring-violet-200"
                />
                <span className="text-xs sm:text-sm text-gray-700">
                  Right-click
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={helpModes.includes('labelEmbedded')}
                  onChange={() => toggleHelpMode('labelEmbedded')}
                  className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-2 focus:ring-violet-200"
                />
                <span className="text-xs sm:text-sm text-gray-700">
                  Label ✨
                </span>
              </label>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              Long-press ✨ to fill all
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-3 sm:mt-4">
          <button
            onClick={handleSave}
            className="flex-1 rounded-lg bg-violet-600 py-1.5 sm:py-2 text-sm sm:text-base font-semibold text-white hover:bg-violet-700 transition"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 py-1.5 sm:py-2 text-sm sm:text-base font-semibold text-gray-700 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}
