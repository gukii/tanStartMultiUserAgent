/**
 * CollaborationHarness
 *
 * A zero-config Higher-Order Component that turns any wrapped route into a
 * multiplayer environment. Wrap any component tree and get:
 *
 *   • Ghost cursors for every connected peer (human or AI Agent)
 *   • Live form-field synchronisation across all clients
 *   • A "Live Semantic Map" broadcast to AI Agents via WebSocket
 *   • Draft/suggestion flow: AI proposes a value → human Accepts or Rejects
 *   • CRDT-lite (last-write-wins with timestamps) to prevent input conflicts
 *   • Clean teardown on unmount
 *
 * Usage:
 *   <CollaborationHarness roomId="checkout-42" userName="Alice">
 *     <CheckoutForm />
 *   </CollaborationHarness>
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import PartySocket from 'partysocket'
import { nanoid } from 'nanoid'
import { useMultiplayerMap } from '../hooks/useMultiplayerMap'
import { GhostCursor } from './GhostCursor'
import { AISuggestionBubble } from './AISuggestionBubble'
import type {
  ClientMessage,
  CollaborationHarnessProps,
  CursorPosition,
  CursorState,
  DraftSuggestion,
  FieldValue,
  RoomState,
  ServerMessage,
} from '../types/collaboration'

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const CURSOR_THROTTLE_MS = 50

const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
]

function randomColor() {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)]
}

const ADJECTIVES = ['Quick', 'Bright', 'Calm', 'Bold', 'Swift', 'Keen', 'Sage']
const NOUNS = ['Fox', 'Bear', 'Hawk', 'Wolf', 'Owl', 'Lynx', 'Deer']
function randomName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  return `${adj} ${noun}`
}

/**
 * Sets a controlled React input's value programmatically without triggering
 * React's internal "bail out if value unchanged" check, then dispatches native
 * `input` + `change` events so that React's synthetic event system picks it up
 * (works with controlled components including TanStack Form).
 */
function setNativeInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

// ---------------------------------------------------------------------------
// Context for child components to access collaboration state
// ---------------------------------------------------------------------------

interface CollaborationContextValue {
  connected: boolean
  userId: string
  userName: string
  userColor: string
  submitMode: 'any' | 'consensus'
  users: Record<string, { userId: string; name: string; color: string }>
  readyStates: Record<string, boolean>
  markReady: () => void
  unmarkReady: () => void
}

const CollaborationContext = createContext<CollaborationContextValue | null>(null)

export function useCollaboration() {
  const ctx = useContext(CollaborationContext)
  if (!ctx) throw new Error('useCollaboration must be used within CollaborationHarness')
  return ctx
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CollaborationHarness({
  children,
  roomId,
  userName,
  userColor,
  partyKitHost,
  disabled = false,
  submitMode = 'any',
  onFieldUpdate,
  onSchemaUpdate,
}: CollaborationHarnessProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const socketRef = useRef<PartySocket | null>(null)

  // Stable per-session identity (client-side only to avoid hydration mismatch)
  const [userId, setUserId] = useState<string>('')
  const [name, setName] = useState<string>('')
  const [color, setColor] = useState<string>('')

  // Generate stable IDs after hydration
  useEffect(() => {
    setUserId(nanoid(8))
    setName(userName ?? randomName())
    setColor(userColor ?? randomColor())
  }, [userName, userColor])

  // CRDT-lite: track local write timestamps per field so we can ignore
  // stale remote updates that arrive after a local edit.
  const fieldTimestamps = useRef<Record<string, number>>({})

  const [connected, setConnected] = useState(false)
  const [remoteCursors, setRemoteCursors] = useState<Record<string, CursorState>>({})
  const [, setRemoteFieldValues] = useState<Record<string, FieldValue>>({})
  const [drafts, setDrafts] = useState<Record<string, DraftSuggestion>>({})
  const [users, setUsers] = useState<Record<string, { userId: string; name: string; color: string }>>({})
  const [currentSubmitMode, setCurrentSubmitMode] = useState<'any' | 'consensus'>(submitMode)
  const [readyStates, setReadyStates] = useState<Record<string, boolean>>({})

  // ------------------------------------------------------------------
  // Live semantic map via MutationObserver
  // ------------------------------------------------------------------
  const pageSchema = useMultiplayerMap(
    containerRef as RefObject<HTMLElement | null>,
    onSchemaUpdate,
  )

  // ------------------------------------------------------------------
  // Stable room ID derived from the current URL path
  // ------------------------------------------------------------------
  const resolvedRoomId = useMemo(() => {
    if (roomId) return roomId
    if (typeof window !== 'undefined') {
      const slug = window.location.pathname.replace(/\//g, '-').replace(/^-|-$/g, '') || 'root'
      return `room-${slug}`
    }
    return 'room-root'
  }, [roomId])

  // ------------------------------------------------------------------
  // Send helper (type-safe)
  // ------------------------------------------------------------------
  const send = useCallback((msg: ClientMessage) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg))
    }
  }, [])

  // ------------------------------------------------------------------
  // Apply a remote field value to the DOM element
  // ------------------------------------------------------------------
  const applyFieldUpdate = useCallback((fieldId: string, value: string) => {
    const container = containerRef.current
    if (!container) return

    // Prefer name selector over id (since we prefer name when capturing events)
    const el = container.querySelector<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >(`[name="${CSS.escape(fieldId)}"], [id="${CSS.escape(fieldId)}"]`)

    if (!el) return

    if (el instanceof HTMLSelectElement) {
      el.value = value
      el.dispatchEvent(new Event('change', { bubbles: true }))
    } else {
      setNativeInputValue(el, value)
    }
  }, [])

  // ------------------------------------------------------------------
  // Highlight a field as containing a draft suggestion
  // ------------------------------------------------------------------
  const applyDraftHighlight = useCallback((fieldId: string, active: boolean) => {
    const container = containerRef.current
    if (!container) return
    const el = container.querySelector<HTMLElement>(
      `[id="${CSS.escape(fieldId)}"], [name="${CSS.escape(fieldId)}"]`,
    )
    if (!el) return
    if (active) {
      el.setAttribute('data-draft', 'true')
    } else {
      el.removeAttribute('data-draft')
      // Reset any inline styles the harness may have set
      ;(el as HTMLElement & { style: CSSStyleDeclaration }).style.backgroundColor = ''
      ;(el as HTMLElement & { style: CSSStyleDeclaration }).style.borderColor = ''
    }
  }, [])

  // ------------------------------------------------------------------
  // Handle incoming WebSocket messages
  // ------------------------------------------------------------------
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(event.data as string) as ServerMessage
      } catch {
        return
      }

      switch (msg.type) {
        case 'ROOM_STATE': {
          const state: RoomState = msg.state
          // Hydrate cursors (exclude self) and refresh lastSeen to current time
          const now = Date.now()
          setRemoteCursors(
            Object.fromEntries(
              Object.entries(state.cursors)
                .filter(([id]) => id !== userId)
                .map(([id, cursor]) => [id, { ...cursor, lastSeen: now }]),
            ),
          )
          setRemoteFieldValues(state.fieldValues)
          setDrafts(state.drafts)
          setUsers(state.users)
          setCurrentSubmitMode(state.submitMode)
          setReadyStates(state.readyStates)
          // Apply initial field values to DOM
          Object.entries(state.fieldValues).forEach(([fid, fv]) =>
            applyFieldUpdate(fid, fv.value),
          )
          // Re-highlight any active drafts
          Object.keys(state.drafts).forEach((fid) => applyDraftHighlight(fid, true))
          break
        }

        case 'REMOTE_CURSOR': {
          if (msg.userId === userId) break
          // Always use current time for lastSeen to handle delayed messages
          setRemoteCursors((prev) => ({
            ...prev,
            [msg.userId]: {
              userId: msg.userId,
              name: msg.name,
              color: msg.color,
              ...msg.position,
              lastSeen: Date.now(), // Client-side timestamp to handle throttling
            },
          }))
          break
        }

        case 'REMOTE_FIELD_UPDATE': {
          if (msg.userId === userId) break
          // CRDT-lite: only apply if the remote write is newer than our last local write
          const localTs = fieldTimestamps.current[msg.fieldId] ?? 0
          if (msg.timestamp > localTs) {
            applyFieldUpdate(msg.fieldId, msg.value)
            setRemoteFieldValues((prev) => ({
              ...prev,
              [msg.fieldId]: {
                value: msg.value,
                updatedBy: msg.userId,
                updatedAt: msg.timestamp,
              },
            }))
            onFieldUpdate?.(msg.fieldId, msg.value, msg.userId)
          }
          break
        }

        case 'REMOTE_DRAFT': {
          const draft: DraftSuggestion = {
            fieldId: msg.fieldId,
            value: msg.value,
            source: msg.source,
            reason: msg.reason,
          }
          setDrafts((prev) => ({ ...prev, [msg.fieldId]: draft }))
          applyDraftHighlight(msg.fieldId, true)
          break
        }

        case 'DRAFT_ACCEPTED':
        case 'DRAFT_REJECTED': {
          setDrafts((prev) => {
            const next = { ...prev }
            delete next[msg.fieldId]
            return next
          })
          applyDraftHighlight(msg.fieldId, false)
          break
        }

        case 'USER_JOIN': {
          setUsers((prev) => ({ ...prev, [msg.user.userId]: msg.user }))
          break
        }

        case 'USER_LEAVE': {
          setRemoteCursors((prev) => {
            const next = { ...prev }
            delete next[msg.userId]
            return next
          })
          setUsers((prev) => {
            const next = { ...prev }
            delete next[msg.userId]
            return next
          })
          setReadyStates((prev) => {
            const next = { ...prev }
            delete next[msg.userId]
            return next
          })
          break
        }

        case 'READY_STATE_CHANGE': {
          setReadyStates((prev) => ({ ...prev, [msg.userId]: msg.isReady }))
          break
        }

        case 'SUBMIT_MODE_CHANGE': {
          setCurrentSubmitMode(msg.mode)
          setReadyStates({}) // Clear all ready states
          break
        }

        // These are broadcast-only; no local action needed
        case 'REMOTE_PAGE_SCHEMA':
          break
      }
    },
    [userId, applyFieldUpdate, applyDraftHighlight, onFieldUpdate],
  )

  // ------------------------------------------------------------------
  // WebSocket lifecycle
  // ------------------------------------------------------------------
  useEffect(() => {
    if (disabled || !userId) return // Wait for userId to be generated

    const host =
      partyKitHost ??
      (typeof import.meta.env !== 'undefined'
        ? (import.meta.env.VITE_PARTYKIT_HOST as string | undefined)
        : undefined) ??
      '127.0.0.1:1999'

    const socket = new PartySocket({
      host,
      room: resolvedRoomId,
      query: { userId, name, color },
    })
    socketRef.current = socket

    socket.addEventListener('open', () => {
      setConnected(true)
      send({ type: 'IDENTIFY', userId, name, color })
    })
    socket.addEventListener('message', handleMessage)
    socket.addEventListener('close', () => setConnected(false))

    return () => {
      socket.close()
      socketRef.current = null
      setConnected(false)
    }
  }, [disabled, resolvedRoomId, userId, name, color, partyKitHost, send, handleMessage])

  // ------------------------------------------------------------------
  // Broadcast page schema whenever it changes
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!connected || disabled) return
    send({ type: 'PAGE_SCHEMA', schema: pageSchema })
  }, [pageSchema, connected, disabled, send])

  // ------------------------------------------------------------------
  // Send SET_SUBMIT_MODE when submitMode prop changes
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!connected || disabled) return
    if (submitMode !== currentSubmitMode) {
      send({ type: 'SET_SUBMIT_MODE', mode: submitMode })
    }
  }, [submitMode, currentSubmitMode, connected, disabled, send])

  // ------------------------------------------------------------------
  // Track & broadcast local cursor position (throttled)
  // ------------------------------------------------------------------
  const lastCursorPosition = useRef<CursorPosition | null>(null)

  const broadcastCursor = useCallback(
    (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return

      const cRect = container.getBoundingClientRect()
      const x = (e.clientX - cRect.left) / cRect.width
      const y = (e.clientY - cRect.top) / cRect.height

      // Try to resolve field-relative coords
      const target = e.target as HTMLElement
      const fieldEl = target.closest<HTMLElement>(
        'input, textarea, select, button, [contenteditable]',
      )

      let activeField: string | undefined
      let fieldRelativeX: number | undefined
      let fieldRelativeY: number | undefined

      if (fieldEl && container.contains(fieldEl)) {
        // Prefer 'name' over 'id' for consistency with field sync
        activeField = fieldEl.getAttribute('name') || fieldEl.id || undefined
        if (activeField) {
          const fRect = fieldEl.getBoundingClientRect()
          fieldRelativeX = (e.clientX - fRect.left) / fRect.width
          fieldRelativeY = (e.clientY - fRect.top) / fRect.height
        }
      }

      const position: CursorPosition = { x, y, activeField, fieldRelativeX, fieldRelativeY }
      lastCursorPosition.current = position
      send({ type: 'CURSOR_MOVE', position })
    },
    [send],
  )

  useEffect(() => {
    if (disabled || !connected) return
    const container = containerRef.current
    if (!container) return

    let lastSent = 0

    function onMouseMove(e: MouseEvent) {
      const now = Date.now()
      if (now - lastSent < CURSOR_THROTTLE_MS) return
      lastSent = now
      broadcastCursor(e)
    }

    container.addEventListener('mousemove', onMouseMove)
    return () => container.removeEventListener('mousemove', onMouseMove)
  }, [disabled, connected, broadcastCursor])

  // ------------------------------------------------------------------
  // Re-broadcast cursor when tab becomes visible (fixes throttling)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (disabled || !connected) return

    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && lastCursorPosition.current) {
        // Re-send last known cursor position when tab becomes active
        send({ type: 'CURSOR_MOVE', position: lastCursorPosition.current })
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [disabled, connected, send])

  // ------------------------------------------------------------------
  // Periodic cursor heartbeat (every 3 seconds) to keep presence alive
  // ------------------------------------------------------------------
  useEffect(() => {
    if (disabled || !connected) return

    const interval = setInterval(() => {
      if (lastCursorPosition.current) {
        send({ type: 'CURSOR_MOVE', position: lastCursorPosition.current })
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [disabled, connected, send])

  // ------------------------------------------------------------------
  // Intercept local form edits and broadcast them
  // ------------------------------------------------------------------
  useEffect(() => {
    if (disabled || !connected) return
    const container = containerRef.current
    if (!container) return

    function onInput(e: Event) {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      if (!('value' in target)) return
      // Prefer 'name' over 'id' since React's useId() generates instance-specific IDs
      const fieldId = target.getAttribute('name') || target.id
      if (!fieldId) return

      const timestamp = Date.now()
      fieldTimestamps.current[fieldId] = timestamp

      send({ type: 'UPDATE_FIELD', fieldId, value: target.value, timestamp })

      // If this field had a draft, typing over it implicitly rejects it
      setDrafts((prev) => {
        if (!prev[fieldId]) return prev
        const next = { ...prev }
        delete next[fieldId]
        applyDraftHighlight(fieldId, false)
        return next
      })
    }

    container.addEventListener('input', onInput)
    container.addEventListener('change', onInput)
    return () => {
      container.removeEventListener('input', onInput)
      container.removeEventListener('change', onInput)
    }
  }, [disabled, connected, send, applyDraftHighlight])

  // ------------------------------------------------------------------
  // Draft accept / reject handlers
  // ------------------------------------------------------------------
  const handleAccept = useCallback(
    (fieldId: string) => {
      const draft = drafts[fieldId]
      if (!draft) return

      applyFieldUpdate(fieldId, draft.value)
      fieldTimestamps.current[fieldId] = Date.now()
      applyDraftHighlight(fieldId, false)
      send({ type: 'ACCEPT_DRAFT', fieldId })
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[fieldId]
        return next
      })
    },
    [drafts, applyFieldUpdate, applyDraftHighlight, send],
  )

  const handleReject = useCallback(
    (fieldId: string) => {
      applyDraftHighlight(fieldId, false)
      send({ type: 'REJECT_DRAFT', fieldId })
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[fieldId]
        return next
      })
    },
    [applyDraftHighlight, send],
  )

  const markReady = useCallback(() => {
    send({ type: 'MARK_READY' })
    setReadyStates((prev) => ({ ...prev, [userId]: true }))
  }, [send, userId])

  const unmarkReady = useCallback(() => {
    send({ type: 'UNMARK_READY' })
    setReadyStates((prev) => ({ ...prev, [userId]: false }))
  }, [send, userId])

  // ------------------------------------------------------------------
  // Context value
  // ------------------------------------------------------------------
  const contextValue: CollaborationContextValue = useMemo(
    () => ({
      connected,
      userId,
      userName: name,
      userColor: color,
      submitMode: currentSubmitMode,
      users,
      readyStates,
      markReady,
      unmarkReady,
    }),
    [connected, userId, name, color, currentSubmitMode, users, readyStates, markReady, unmarkReady],
  )

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  // Provide a minimal context during SSR/hydration
  const defaultContextValue: CollaborationContextValue = useMemo(
    () => ({
      connected: false,
      userId: '',
      userName: '',
      userColor: '',
      submitMode: 'any',
      users: {},
      readyStates: {},
      markReady: () => {},
      unmarkReady: () => {},
    }),
    [],
  )

  if (disabled) {
    return (
      <CollaborationContext.Provider value={defaultContextValue}>
        {children}
      </CollaborationContext.Provider>
    )
  }

  // Wait for client-side hydration before rendering collaboration features
  if (!userId) {
    return (
      <CollaborationContext.Provider value={defaultContextValue}>
        {children}
      </CollaborationContext.Provider>
    )
  }

  return (
    <CollaborationContext.Provider value={contextValue}>
      <div
        ref={containerRef}
        style={{ position: 'relative' }}
        data-collab-room={resolvedRoomId}
        data-collab-user={userId}
      >
      {children}

      {/* Ghost cursors for remote peers */}
      {Object.values(remoteCursors).map((cursor) => (
        <GhostCursor
          key={cursor.userId}
          cursor={cursor}
          containerRef={containerRef as RefObject<HTMLElement | null>}
        />
      ))}

      {/* AI draft suggestion bubbles */}
      {Object.values(drafts).map((draft) => (
        <AISuggestionBubble
          key={draft.fieldId}
          draft={draft}
          schema={pageSchema.find((f) => f.id === draft.fieldId)}
          containerRef={containerRef as RefObject<HTMLElement | null>}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      ))}

      {/* Tiny connection-status dot */}
      <div
        title={connected ? `Live · ${resolvedRoomId}` : 'Connecting…'}
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: connected ? '#22c55e' : '#f59e0b',
          border: '2px solid #fff',
          pointerEvents: 'none',
          zIndex: 9998,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.1)',
        }}
        aria-hidden="true"
      />
      </div>
    </CollaborationContext.Provider>
  )
}
