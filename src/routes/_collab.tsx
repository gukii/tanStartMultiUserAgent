/**
 * Layout route: _collab.tsx
 *
 * This layout wraps all child routes under /_collab/* with collaboration features.
 * Child routes automatically inherit real-time sync, ghost cursors, and field locking.
 *
 * Example child routes:
 *   - _collab.order-form.tsx    → /order-form
 *   - _collab.checkout.tsx      → /checkout
 *   - _collab.invoice.$id.tsx   → /invoice/:id
 */

import { Outlet, createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { CollaborationHarness } from '../components/CollaborationHarness'
import { FloatingCursorChat, type FloatingChatPosition } from '../components/FloatingCursorChat'
import { UserSettingsPanel } from '../components/UserSettingsPanel'
import { useCollaboration } from '../components/CollaborationHarness'

export const Route = createFileRoute('/_collab')({
  component: CollabLayout,
})

function CollabLayout() {
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Load floating chat position from localStorage, default to bottom-right
  const [floatingChatPosition, setFloatingChatPositionState] = useState<FloatingChatPosition>(() => {
    if (typeof window === 'undefined') return 'bottom-right'
    const saved = localStorage.getItem('floatingChatPosition')
    return (saved as FloatingChatPosition) || 'bottom-right'
  })

  // Persist position to localStorage
  const setFloatingChatPosition = (position: FloatingChatPosition) => {
    setFloatingChatPositionState(position)
    if (typeof window !== 'undefined') {
      localStorage.setItem('floatingChatPosition', position)
    }
  }

  // Use pathname as roomId so each route gets its own collaboration room
  const roomId = typeof window !== 'undefined'
    ? window.location.pathname
    : 'default'

  const partyKitHost = import.meta.env.VITE_PARTYKIT_HOST as string | undefined

  return (
    <CollaborationHarness
      roomId={roomId}
      partyKitHost={partyKitHost}
      submitMode="any" // Child routes can override this if needed
    >
      {/* All child routes render here */}
      <Outlet />

      {/* Shared collaboration UI - available on all child routes */}
      <FloatingCursorChat
        position={floatingChatPosition}
        onSettingsClick={() => setSettingsOpen(true)}
      />

      <SettingsPanelWrapper
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        floatingChatPosition={floatingChatPosition}
        setFloatingChatPosition={setFloatingChatPosition}
      />
    </CollaborationHarness>
  )
}

/**
 * Wrapper component to access collaboration context for settings panel
 */
function SettingsPanelWrapper({
  isOpen,
  onClose,
  floatingChatPosition,
  setFloatingChatPosition,
}: {
  isOpen: boolean
  onClose: () => void
  floatingChatPosition: FloatingChatPosition
  setFloatingChatPosition: (position: FloatingChatPosition) => void
}) {
  const { userName, userColor, cursorMessage, updateUser, setCursorMessage } = useCollaboration()

  return (
    <UserSettingsPanel
      isOpen={isOpen}
      onClose={onClose}
      userName={userName}
      userColor={userColor}
      cursorMessage={cursorMessage}
      floatingChatPosition={floatingChatPosition}
      updateUser={updateUser}
      setCursorMessage={setCursorMessage}
      setFloatingChatPosition={setFloatingChatPosition}
    />
  )
}
