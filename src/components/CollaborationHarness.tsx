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
  cursorMessage: string
  submitMode: 'any' | 'consensus'
  users: Record<string, { userId: string; name: string; color: string }>
  readyStates: Record<string, boolean>
  markReady: () => void
  unmarkReady: () => void
  updateUser: (name: string, color: string) => void
  setCursorMessage: (message: string) => void
  touchCursorMode: boolean
  setTouchCursorMode: (enabled: boolean) => void
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
  const [cursorMessage, setCursorMessageState] = useState<string>('')
  const [fieldLocks, setFieldLocks] = useState<Record<string, string>>({}) // fieldId -> userId
  const focusedFieldRef = useRef<string | null>(null) // Track which field we have focused
  const forceLockingFieldRef = useRef<string | null>(null) // Track field we're force-locking (ignore next FIELD_UNLOCKED)
  const [touchCursorMode, setTouchCursorMode] = useState(false) // Toggle for touch cursor painting
  const fieldActivityTimestamps = useRef<Record<string, number>>({}) // Track last activity time per field per user (fieldId -> timestamp)
  const [evictionBlocked, setEvictionBlocked] = useState<string | null>(null) // Track which field eviction was blocked for (show visual feedback)

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
          setFieldLocks(state.fieldLocks)

          // Initialize our local timestamps from the server state
          // This prevents us from overwriting server values with stale local edits
          Object.entries(state.fieldValues).forEach(([fid, fv]) => {
            fieldTimestamps.current[fid] = fv.updatedAt
          })

          // Apply initial field values to DOM
          // Use setTimeout to ensure DOM is ready (especially for newly joined users)
          setTimeout(() => {
            Object.entries(state.fieldValues).forEach(([fid, fv]) => {
              // Skip fields that are currently focused by us
              if (fid === focusedFieldRef.current) return
              // Skip fields locked by others (we can't edit them anyway)
              const lockOwner = state.fieldLocks[fid]
              if (lockOwner && lockOwner !== userId) return

              applyFieldUpdate(fid, fv.value)
            })
          }, 100)

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
              message: msg.message,
              lastSeen: Date.now(), // Client-side timestamp to handle throttling
            },
          }))
          break
        }

        case 'FIELD_LOCKED': {
          setFieldLocks((prev) => ({ ...prev, [msg.fieldId]: msg.userId }))
          break
        }

        case 'FIELD_ACTIVITY': {
          // Update activity timestamp for this field
          fieldActivityTimestamps.current[msg.fieldId] = msg.timestamp
          break
        }

        case 'FIELD_UNLOCKED': {
          // Always update fieldLocks state to remove the lock
          setFieldLocks((prev) => {
            const next = { ...prev }
            delete next[msg.fieldId]
            return next
          })

          // If we're force-locking this field, don't blur (we're taking control)
          if (forceLockingFieldRef.current === msg.fieldId) {
            forceLockingFieldRef.current = null // Clear the flag
            break // Don't blur our own field
          }

          // If we're currently focused on this field, we got kicked out - evict immediately
          if (focusedFieldRef.current === msg.fieldId) {
            const container = containerRef.current
            if (container) {
              const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
                `[name="${CSS.escape(msg.fieldId)}"], [id="${CSS.escape(msg.fieldId)}"]`
              )
              if (field) {
                // Immediately disable the field to prevent further input
                field.setAttribute('readonly', 'readonly')
                field.style.backgroundColor = '#fecaca' // Red tint to show you've been kicked out
                field.style.opacity = '0.6'

                // Force blur if still focused
                if (document.activeElement === field) {
                  field.blur()
                }
                focusedFieldRef.current = null
              }
            }
          }
          break
        }

        case 'REMOTE_FIELD_UPDATE': {
          if (msg.userId === userId) break
          // Don't apply updates to fields we currently have focused
          if (msg.fieldId === focusedFieldRef.current) break
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

        case 'USER_UPDATED': {
          setUsers((prev) => ({
            ...prev,
            [msg.userId]: { userId: msg.userId, name: msg.name, color: msg.color }
          }))
          // Update cursor info too
          setRemoteCursors((prev) => {
            const cursor = prev[msg.userId]
            if (!cursor) return prev
            return {
              ...prev,
              [msg.userId]: { ...cursor, name: msg.name, color: msg.color }
            }
          })
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
    (clientX: number, clientY: number) => {
      const container = containerRef.current
      if (!container) return

      const cRect = container.getBoundingClientRect()
      const x = (clientX - cRect.left) / cRect.width
      const y = (clientY - cRect.top) / cRect.height

      // Try to resolve field-relative coords
      const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null
      if (!target) return

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
          fieldRelativeX = (clientX - fRect.left) / fRect.width
          fieldRelativeY = (clientY - fRect.top) / fRect.height
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
      broadcastCursor(e.clientX, e.clientY)
    }

    function onTouchMove(e: TouchEvent) {
      // Only paint cursor on touch if cursor painting mode is enabled
      if (!touchCursorMode) return

      const now = Date.now()
      if (now - lastSent < CURSOR_THROTTLE_MS) return
      lastSent = now

      const touch = e.touches[0]
      if (touch) {
        console.log('[TOUCH] Broadcasting cursor position:', touch.clientX, touch.clientY)
        broadcastCursor(touch.clientX, touch.clientY)
      }
    }

    function onTouchStart(e: TouchEvent) {
      if (!touchCursorMode) return
      console.log('[TOUCH] Touch started, mode:', touchCursorMode)

      const touch = e.touches[0]
      if (touch) {
        broadcastCursor(touch.clientX, touch.clientY)
      }
    }

    container.addEventListener('mousemove', onMouseMove)
    container.addEventListener('touchstart', onTouchStart, { passive: true })
    container.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      container.removeEventListener('mousemove', onMouseMove)
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
    }
  }, [disabled, connected, broadcastCursor, touchCursorMode])

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
  // Double-click/tap to force-lock a field (kick out current user)
  // Only allows eviction if current owner has been inactive for 3+ seconds
  // ------------------------------------------------------------------
  useEffect(() => {
    if (disabled || !connected) return
    const container = containerRef.current
    if (!container) return

    let lastClickTime = 0
    let lastClickedFieldId: string | null = null
    const DOUBLE_CLICK_THRESHOLD_MS = 400
    const INACTIVITY_THRESHOLD_MS = 3000 // Must be inactive for 3 seconds before eviction

    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement
      const fieldEl = target.closest<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input, textarea, select',
      )
      if (!fieldEl || !container.contains(fieldEl)) {
        // Clicked outside a field - reset tracking
        lastClickTime = 0
        lastClickedFieldId = null
        return
      }

      const fieldId = fieldEl.getAttribute('name') || fieldEl.id
      if (!fieldId) return

      const now = Date.now()
      const timeSinceLastClick = now - lastClickTime

      // Check if this is a double-click on the same field within threshold
      if (
        lastClickedFieldId === fieldId &&
        timeSinceLastClick > 0 &&
        timeSinceLastClick < DOUBLE_CLICK_THRESHOLD_MS
      ) {
        // This is a double-click on the same field
        const lockOwnerId = fieldLocks[fieldId]
        if (lockOwnerId && lockOwnerId !== userId) {
          console.log('[FORCE LOCK] Double-click detected on locked field:', fieldId, 'current owner:', lockOwnerId)

          // Check when the current owner was last active
          const lastActivity = fieldActivityTimestamps.current[fieldId] || 0
          const timeSinceActivity = now - lastActivity

          if (timeSinceActivity < INACTIVITY_THRESHOLD_MS) {
            // Owner is still active - prevent eviction
            console.log('[FORCE LOCK] Eviction blocked - owner active within', timeSinceActivity, 'ms')

            // Prevent default to avoid text selection
            e.preventDefault()
            e.stopPropagation()

            // Show visual feedback that eviction was blocked
            setEvictionBlocked(fieldId)
            setTimeout(() => setEvictionBlocked(null), 1500)

            // Reset click tracking
            lastClickTime = 0
            lastClickedFieldId = null
            return
          }

          console.log('[FORCE LOCK] Evicting inactive owner (inactive for', timeSinceActivity, 'ms)')

          // Prevent default to avoid text selection
          e.preventDefault()
          e.stopPropagation()

          // Force-lock the field, kicking out the current owner
          forceLockingFieldRef.current = fieldId
          focusedFieldRef.current = fieldId

          // Optimistically update local state to show we own the lock
          setFieldLocks((prev) => ({ ...prev, [fieldId]: userId }))

          // Send force-lock message
          send({ type: 'FORCE_FIELD_FOCUS', fieldId })

          // Force focus on the field
          setTimeout(() => {
            fieldEl.focus()
          }, 0)

          // Remove readonly attribute and styling immediately for responsiveness
          fieldEl.removeAttribute('readonly')
          fieldEl.style.backgroundColor = ''
          fieldEl.style.opacity = ''
          fieldEl.style.cursor = ''

          // Update cursor position
          if (lastCursorPosition.current) {
            lastCursorPosition.current = {
              ...lastCursorPosition.current,
              activeField: fieldId,
              fieldRelativeX: 0.5,
              fieldRelativeY: 0.5,
            }
            send({ type: 'CURSOR_MOVE', position: lastCursorPosition.current })
          }

          // Reset click tracking after successful double-click
          lastClickTime = 0
          lastClickedFieldId = null
          return
        }
      }

      // Update click tracking
      lastClickTime = now
      lastClickedFieldId = fieldId
    }

    // Use mousedown instead of click for more reliable detection
    container.addEventListener('mousedown', onMouseDown, true)
    return () => container.removeEventListener('mousedown', onMouseDown, true)
  }, [fieldLocks, userId, disabled, connected, send])

  // ------------------------------------------------------------------
  // Track focus/blur to lock fields and update cursor activeField
  // ------------------------------------------------------------------
  useEffect(() => {
    if (disabled || !connected) return
    const container = containerRef.current
    if (!container) return

    function onFocus(e: FocusEvent) {
      const target = e.target as HTMLElement
      const fieldEl = target.closest<HTMLElement>(
        'input, textarea, select, button, [contenteditable]',
      )
      if (!fieldEl || !container!.contains(fieldEl)) return

      const fieldId = fieldEl.getAttribute('name') || fieldEl.id
      if (!fieldId) return

      focusedFieldRef.current = fieldId
      send({ type: 'FIELD_FOCUS', fieldId })

      // Update cursor position to show we're at this field
      if (lastCursorPosition.current) {
        lastCursorPosition.current = {
          ...lastCursorPosition.current,
          activeField: fieldId,
          fieldRelativeX: 0.5,
          fieldRelativeY: 0.5,
        }
        send({ type: 'CURSOR_MOVE', position: lastCursorPosition.current })
      }
    }

    function onBlur(e: FocusEvent) {
      const target = e.target as HTMLElement
      const fieldEl = target.closest<HTMLElement>(
        'input, textarea, select, button, [contenteditable]',
      )
      if (!fieldEl || !container!.contains(fieldEl)) return

      const fieldId = fieldEl.getAttribute('name') || fieldEl.id
      if (!fieldId) return

      focusedFieldRef.current = null
      send({ type: 'FIELD_BLUR', fieldId })

      // Clear activeField from cursor
      if (lastCursorPosition.current) {
        lastCursorPosition.current = {
          ...lastCursorPosition.current,
          activeField: undefined,
          fieldRelativeX: undefined,
          fieldRelativeY: undefined,
        }
        send({ type: 'CURSOR_MOVE', position: lastCursorPosition.current })
      }
    }

    container.addEventListener('focusin', onFocus)
    container.addEventListener('focusout', onBlur)
    return () => {
      container.removeEventListener('focusin', onFocus)
      container.removeEventListener('focusout', onBlur)
    }
  }, [disabled, connected, send])

  // ------------------------------------------------------------------
  // Block input events on locked fields
  // ------------------------------------------------------------------
  useEffect(() => {
    if (disabled || !connected) return
    const container = containerRef.current
    if (!container) return

    const blockLockedInput = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      if (!('value' in target)) return

      const fieldId = target.getAttribute('name') || target.id
      if (!fieldId) return

      // Check if this field is locked by someone else
      const lockOwnerId = fieldLocks[fieldId]
      if (lockOwnerId && lockOwnerId !== userId) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        return false
      }
    }

    // Use capture phase to intercept events before React handlers
    container.addEventListener('input', blockLockedInput, true)
    container.addEventListener('change', blockLockedInput, true)
    container.addEventListener('keydown', blockLockedInput, true)
    container.addEventListener('keypress', blockLockedInput, true)
    container.addEventListener('keyup', blockLockedInput, true)
    container.addEventListener('beforeinput', blockLockedInput, true)

    return () => {
      container.removeEventListener('input', blockLockedInput, true)
      container.removeEventListener('change', blockLockedInput, true)
      container.removeEventListener('keydown', blockLockedInput, true)
      container.removeEventListener('keypress', blockLockedInput, true)
      container.removeEventListener('keyup', blockLockedInput, true)
      container.removeEventListener('beforeinput', blockLockedInput, true)
    }
  }, [fieldLocks, userId, disabled, connected])

  // ------------------------------------------------------------------
  // Apply visual styling to locked fields
  // ------------------------------------------------------------------
  useEffect(() => {
    if (disabled || !connected) return
    const container = containerRef.current
    if (!container) return

    // Remove all lock styling first
    const allFields = container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input, textarea, select'
    )
    allFields.forEach((field) => {
      // Only clear if this field isn't currently being edited by us
      const fieldId = field.getAttribute('name') || field.id
      if (fieldId && focusedFieldRef.current === fieldId) return // Don't touch our focused field

      field.removeAttribute('readonly')
      field.removeAttribute('data-locked-by')
      field.style.backgroundColor = ''
      field.style.opacity = ''
      field.style.cursor = ''
      field.title = ''
      field.style.animation = ''
    })

    // Apply styling to locked fields
    Object.entries(fieldLocks).forEach(([fieldId, lockOwnerId]) => {
      if (lockOwnerId === userId) return // Don't style fields we own

      const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        `[name="${CSS.escape(fieldId)}"], [id="${CSS.escape(fieldId)}"]`
      )
      if (!field) return

      const lockOwner = users[lockOwnerId]
      const ownerName = lockOwner?.name ?? 'Another user'

      // Check if eviction is currently blocked for this field
      const isEvictionBlocked = evictionBlocked === fieldId

      // Set readonly and apply visual styling (gray = locked by someone else)
      field.setAttribute('readonly', 'readonly')
      field.setAttribute('data-locked-by', ownerName)

      if (isEvictionBlocked) {
        // Show red flash when eviction is blocked (user is still active)
        field.style.backgroundColor = '#fca5a5' // Red tint
        field.style.opacity = '0.9'
        field.style.animation = 'shake 0.3s'
        field.title = `⛔ ${ownerName} is actively typing - wait a moment before taking control.`
      } else {
        // Normal locked state
        field.style.backgroundColor = '#f3f4f6' // Light gray background
        field.style.opacity = '0.7'
        field.title = `🔒 ${ownerName} is editing this field. Double-click to take control (if inactive).`
      }

      field.style.cursor = 'not-allowed'
    })
  }, [fieldLocks, userId, users, disabled, connected, evictionBlocked])

  // Add shake animation keyframes
  useEffect(() => {
    if (typeof document === 'undefined') return

    const styleId = 'collab-harness-animations'
    if (document.getElementById(styleId)) return

    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
      }
    `
    document.head.appendChild(style)

    return () => {
      const existing = document.getElementById(styleId)
      if (existing) document.head.removeChild(existing)
    }
  }, [])

  // ------------------------------------------------------------------
  // Intercept local form edits and broadcast them
  // ------------------------------------------------------------------
  useEffect(() => {
    if (disabled || !connected) return
    const container = containerRef.current
    if (!container) return

    // Track when we last sent activity for each field (throttle to max 1 per second)
    const lastActivityBroadcast: Record<string, number> = {}

    function onInput(e: Event) {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      if (!('value' in target)) return
      // Prefer 'name' over 'id' since React's useId() generates instance-specific IDs
      const fieldId = target.getAttribute('name') || target.id
      if (!fieldId) return

      const timestamp = Date.now()
      fieldTimestamps.current[fieldId] = timestamp
      fieldActivityTimestamps.current[fieldId] = timestamp // Update our own activity

      send({ type: 'UPDATE_FIELD', fieldId, value: target.value, timestamp })

      // Broadcast activity periodically (max once per second) so others know we're typing
      const lastBroadcast = lastActivityBroadcast[fieldId] || 0
      if (timestamp - lastBroadcast > 1000) {
        send({ type: 'FIELD_ACTIVITY', fieldId })
        lastActivityBroadcast[fieldId] = timestamp
      }

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

  const updateUser = useCallback((newName: string, newColor: string) => {
    setName(newName)
    setColor(newColor)
    send({ type: 'UPDATE_USER', name: newName, color: newColor })
    // Immediately broadcast cursor position so others see updated name/color
    if (lastCursorPosition.current) {
      setTimeout(() => {
        if (lastCursorPosition.current) {
          send({ type: 'CURSOR_MOVE', position: lastCursorPosition.current })
        }
      }, 100)
    }
  }, [send])

  const setCursorMessage = useCallback((message: string) => {
    setCursorMessageState(message)
    send({ type: 'SET_CURSOR_MESSAGE', message })
    // Immediately broadcast current cursor position with new message
    // Use a small delay to ensure SET_CURSOR_MESSAGE is processed first
    if (lastCursorPosition.current) {
      setTimeout(() => {
        if (lastCursorPosition.current) {
          send({ type: 'CURSOR_MOVE', position: lastCursorPosition.current })
        }
      }, 100)
    }
  }, [send])

  // ------------------------------------------------------------------
  // Context value
  // ------------------------------------------------------------------
  const contextValue: CollaborationContextValue = useMemo(
    () => ({
      connected,
      userId,
      userName: name,
      userColor: color,
      cursorMessage,
      submitMode: currentSubmitMode,
      users,
      readyStates,
      markReady,
      unmarkReady,
      updateUser,
      setCursorMessage,
      touchCursorMode,
      setTouchCursorMode,
    }),
    [connected, userId, name, color, cursorMessage, currentSubmitMode, users, readyStates, markReady, unmarkReady, updateUser, setCursorMessage, touchCursorMode],
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
      cursorMessage: '',
      submitMode: 'any',
      users: {},
      readyStates: {},
      markReady: () => {},
      unmarkReady: () => {},
      updateUser: () => {},
      setCursorMessage: () => {},
      touchCursorMode: false,
      setTouchCursorMode: () => {},
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
