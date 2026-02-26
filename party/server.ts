/**
 * PartyKit Server – Collaboration Harness
 *
 * Handles all real-time messaging between human collaborators and AI Agents.
 *
 * Room state (held in memory, per-room):
 *   - users       – connected peers
 *   - cursors     – latest cursor position per user
 *   - fieldValues – form field values (last-write-wins CRDT)
 *   - pageSchema  – latest semantic map broadcast by any human client
 *   - drafts      – pending AI draft suggestions awaiting human review
 *
 * Message flow summary:
 *   Human joins   → server sends ROOM_STATE snapshot
 *   Human moves   → CURSOR_MOVE  →  broadcast REMOTE_CURSOR to others
 *   Human types   → UPDATE_FIELD →  broadcast REMOTE_FIELD_UPDATE (if newer)
 *   Human schema  → PAGE_SCHEMA  →  broadcast REMOTE_PAGE_SCHEMA to AI agents
 *   AI proposes   → DRAFT_FIELD  →  broadcast REMOTE_DRAFT to humans
 *   Human accepts → ACCEPT_DRAFT →  broadcast DRAFT_ACCEPTED; remove draft
 *   Human rejects → REJECT_DRAFT →  broadcast DRAFT_REJECTED; remove draft
 *   Peer leaves   → onClose      →  broadcast USER_LEAVE
 *
 * AI Agent integration:
 *   An LLM acting as a client connects like any other WebSocket peer.
 *   It receives ROOM_STATE (including pageSchema) on connect and
 *   REMOTE_PAGE_SCHEMA whenever the DOM changes, giving it full visibility
 *   into the form. It can then send DRAFT_FIELD messages to suggest values.
 */

import type * as Party from 'partykit/server'

// ---------------------------------------------------------------------------
// Shared types (inlined to keep the party server self-contained)
// ---------------------------------------------------------------------------

interface CursorPosition {
  x: number
  y: number
  activeField?: string
  fieldRelativeX?: number
  fieldRelativeY?: number
}

interface UserInfo {
  userId: string
  name: string
  color: string
}

interface CursorState extends UserInfo, CursorPosition {
  lastSeen: number
  message?: string
}

interface FieldValue {
  value: string
  updatedBy: string
  updatedAt: number
}

interface DraftSuggestion {
  fieldId: string
  value: string
  source: string
  reason?: string
}

interface FieldSchema {
  id: string
  name: string
  type: string
  placeholder: string
  label: string
  ariaLabel: string
  aiIntent?: string
}

interface RoomState {
  users: Record<string, UserInfo>
  cursors: Record<string, CursorState>
  fieldValues: Record<string, FieldValue>
  pageSchema: FieldSchema[]
  drafts: Record<string, DraftSuggestion>
  submitMode: 'any' | 'consensus'
  readyStates: Record<string, boolean>
  fieldLocks: Record<string, string>
}

type IncomingMessage =
  | { type: 'IDENTIFY'; userId: string; name: string; color: string }
  | { type: 'UPDATE_USER'; name: string; color: string }
  | { type: 'SET_CURSOR_MESSAGE'; message: string }
  | { type: 'CURSOR_MOVE'; position: CursorPosition }
  | { type: 'FIELD_FOCUS'; fieldId: string }
  | { type: 'FIELD_BLUR'; fieldId: string }
  | { type: 'FIELD_ACTIVITY'; fieldId: string }
  | { type: 'FORCE_FIELD_FOCUS'; fieldId: string }
  | { type: 'UPDATE_FIELD'; fieldId: string; value: string; timestamp: number }
  | { type: 'PAGE_SCHEMA'; schema: FieldSchema[] }
  | { type: 'DRAFT_FIELD'; fieldId: string; value: string; source: string; reason?: string }
  | { type: 'ACCEPT_DRAFT'; fieldId: string }
  | { type: 'REJECT_DRAFT'; fieldId: string }
  | { type: 'MARK_READY' }
  | { type: 'UNMARK_READY' }
  | { type: 'SET_SUBMIT_MODE'; mode: 'any' | 'consensus' }

// Connection-local state (stored on the Party.Connection object)
interface ConnMeta {
  userId: string
}

// ---------------------------------------------------------------------------
// Server class
// ---------------------------------------------------------------------------

export default class CollaborationServer implements Party.Server {
  // In-memory room state – one instance per room, managed by PartyKit
  private users = new Map<string, UserInfo>()
  private cursors = new Map<string, CursorState>()
  private cursorMessages = new Map<string, string>()
  private fieldValues = new Map<string, FieldValue>()
  private drafts = new Map<string, DraftSuggestion>()
  private pageSchema: FieldSchema[] = []
  private submitMode: 'any' | 'consensus' = 'any'
  private readyStates = new Map<string, boolean>()
  private fieldLocks = new Map<string, string>() // fieldId -> userId

  constructor(readonly room: Party.Room) {}

  // ------------------------------------------------------------------
  // onConnect – send the current room snapshot to the joining peer
  // ------------------------------------------------------------------
  onConnect(conn: Party.Connection<ConnMeta>, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url)
    const userId = url.searchParams.get('userId') ?? conn.id
    const name = url.searchParams.get('name') ?? `User-${conn.id.slice(0, 4)}`
    const color = url.searchParams.get('color') ?? '#3b82f6'

    const user: UserInfo = { userId, name, color }
    this.users.set(userId, user)

    // Tag the connection for cleanup
    conn.setState({ userId })

    // Send room snapshot
    const snapshot: RoomState = {
      users: Object.fromEntries(this.users),
      cursors: Object.fromEntries(this.cursors),
      fieldValues: Object.fromEntries(this.fieldValues),
      pageSchema: this.pageSchema,
      drafts: Object.fromEntries(this.drafts),
      submitMode: this.submitMode,
      readyStates: Object.fromEntries(this.readyStates),
      fieldLocks: Object.fromEntries(this.fieldLocks),
    }
    conn.send(JSON.stringify({ type: 'ROOM_STATE', state: snapshot }))

    // Notify everyone else
    this.broadcast({ type: 'USER_JOIN', user }, [conn.id])
  }

  // ------------------------------------------------------------------
  // onMessage – route each message type
  // ------------------------------------------------------------------
  onMessage(raw: string | ArrayBuffer, sender: Party.Connection<ConnMeta>) {
    let msg: IncomingMessage
    try {
      msg = JSON.parse(raw as string) as IncomingMessage
    } catch {
      return
    }

    const userId = sender.state?.userId ?? sender.id

    switch (msg.type) {
      // ----------------------------------------------------------------
      case 'IDENTIFY': {
        const user: UserInfo = { userId: msg.userId, name: msg.name, color: msg.color }
        this.users.set(msg.userId, user)
        break
      }

      // ----------------------------------------------------------------
      case 'UPDATE_USER': {
        const existing = this.users.get(userId)
        if (!existing) break
        const updated: UserInfo = { userId, name: msg.name, color: msg.color }
        this.users.set(userId, updated)
        // Update cursor too
        const cursor = this.cursors.get(userId)
        if (cursor) {
          this.cursors.set(userId, { ...cursor, name: msg.name, color: msg.color })
        }
        this.broadcast({ type: 'USER_UPDATED', userId, name: msg.name, color: msg.color }, [sender.id])
        break
      }

      // ----------------------------------------------------------------
      case 'SET_CURSOR_MESSAGE': {
        this.cursorMessages.set(userId, msg.message)
        break
      }

      // ----------------------------------------------------------------
      case 'CURSOR_MOVE': {
        const user = this.users.get(userId)
        if (!user) break

        const message = this.cursorMessages.get(userId)
        const cursor: CursorState = {
          ...user,
          ...msg.position,
          message,
          lastSeen: Date.now(),
        }
        this.cursors.set(userId, cursor)

        this.broadcast(
          {
            type: 'REMOTE_CURSOR',
            userId,
            position: msg.position,
            name: user.name,
            color: user.color,
            message,
          },
          [sender.id],
        )
        break
      }

      // ----------------------------------------------------------------
      case 'FIELD_FOCUS': {
        const user = this.users.get(userId)
        if (!user) break

        // Lock the field to this user
        this.fieldLocks.set(msg.fieldId, userId)

        this.broadcast(
          {
            type: 'FIELD_LOCKED' as const,
            fieldId: msg.fieldId,
            userId,
            userName: user.name,
          },
          [sender.id],
        )
        break
      }

      // ----------------------------------------------------------------
      case 'FIELD_ACTIVITY': {
        // User is actively typing - broadcast to others so they know not to evict
        const timestamp = Date.now()
        this.broadcast(
          {
            type: 'FIELD_ACTIVITY' as const,
            fieldId: msg.fieldId,
            userId,
            timestamp,
          },
          [sender.id],
        )
        break
      }

      // ----------------------------------------------------------------
      case 'FORCE_FIELD_FOCUS': {
        const user = this.users.get(userId)
        if (!user) break

        // Forcefully take the lock from whoever owns it
        const previousOwner = this.fieldLocks.get(msg.fieldId)
        this.fieldLocks.set(msg.fieldId, userId)

        // Notify everyone about the unlock (including previous owner)
        this.broadcast({ type: 'FIELD_UNLOCKED' as const, fieldId: msg.fieldId })

        // Then immediately lock it to the new user
        this.broadcast(
          {
            type: 'FIELD_LOCKED' as const,
            fieldId: msg.fieldId,
            userId,
            userName: user.name,
          },
          [sender.id],
        )
        break
      }

      // ----------------------------------------------------------------
      case 'FIELD_BLUR': {
        // Only unlock if this user owns the lock
        const lockOwner = this.fieldLocks.get(msg.fieldId)
        if (lockOwner === userId) {
          this.fieldLocks.delete(msg.fieldId)
          this.broadcast({ type: 'FIELD_UNLOCKED' as const, fieldId: msg.fieldId })
        }
        break
      }

      // ----------------------------------------------------------------
      case 'UPDATE_FIELD': {
        // CRDT last-write-wins: only accept if this update is newer
        const existing = this.fieldValues.get(msg.fieldId)
        if (existing && msg.timestamp < existing.updatedAt) break

        const fv: FieldValue = {
          value: msg.value,
          updatedBy: userId,
          updatedAt: msg.timestamp,
        }
        this.fieldValues.set(msg.fieldId, fv)

        this.broadcast(
          {
            type: 'REMOTE_FIELD_UPDATE',
            fieldId: msg.fieldId,
            value: msg.value,
            userId,
            timestamp: msg.timestamp,
          },
          [sender.id],
        )
        break
      }

      // ----------------------------------------------------------------
      case 'PAGE_SCHEMA': {
        // Always take the freshest schema
        this.pageSchema = msg.schema

        this.broadcast(
          { type: 'REMOTE_PAGE_SCHEMA', schema: msg.schema, userId },
          [sender.id],
        )
        break
      }

      // ----------------------------------------------------------------
      case 'DRAFT_FIELD': {
        const draft: DraftSuggestion = {
          fieldId: msg.fieldId,
          value: msg.value,
          source: msg.source,
          reason: msg.reason,
        }
        this.drafts.set(msg.fieldId, draft)

        // Broadcast to all peers (humans will see the suggestion bubble)
        this.broadcast(
          {
            type: 'REMOTE_DRAFT',
            fieldId: msg.fieldId,
            value: msg.value,
            source: msg.source,
            reason: msg.reason,
          },
          [sender.id],
        )
        break
      }

      // ----------------------------------------------------------------
      case 'ACCEPT_DRAFT': {
        this.drafts.delete(msg.fieldId)
        this.broadcast({ type: 'DRAFT_ACCEPTED', fieldId: msg.fieldId, userId })
        break
      }

      // ----------------------------------------------------------------
      case 'REJECT_DRAFT': {
        this.drafts.delete(msg.fieldId)
        this.broadcast({ type: 'DRAFT_REJECTED', fieldId: msg.fieldId, userId })
        break
      }

      // ----------------------------------------------------------------
      case 'MARK_READY': {
        this.readyStates.set(userId, true)
        this.broadcast({ type: 'READY_STATE_CHANGE', userId, isReady: true })
        break
      }

      // ----------------------------------------------------------------
      case 'UNMARK_READY': {
        this.readyStates.set(userId, false)
        this.broadcast({ type: 'READY_STATE_CHANGE', userId, isReady: false })
        break
      }

      // ----------------------------------------------------------------
      case 'SET_SUBMIT_MODE': {
        this.submitMode = msg.mode
        // Clear all ready states when mode changes
        this.readyStates.clear()
        this.broadcast({ type: 'SUBMIT_MODE_CHANGE', mode: msg.mode })
        break
      }
    }
  }

  // ------------------------------------------------------------------
  // onClose – clean up and notify peers
  // ------------------------------------------------------------------
  onClose(conn: Party.Connection<ConnMeta>) {
    const userId = conn.state?.userId ?? conn.id
    this.users.delete(userId)
    this.cursors.delete(userId)
    this.readyStates.delete(userId)

    // Release any field locks held by this user
    const locksToRelease: string[] = []
    for (const [fieldId, lockOwner] of this.fieldLocks.entries()) {
      if (lockOwner === userId) {
        locksToRelease.push(fieldId)
      }
    }
    for (const fieldId of locksToRelease) {
      this.fieldLocks.delete(fieldId)
      this.broadcast({ type: 'FIELD_UNLOCKED', fieldId })
    }

    this.broadcast({ type: 'USER_LEAVE', userId })
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  /** Broadcast a JSON-serialisable message to all connections except those listed. */
  private broadcast(msg: object, exclude: string[] = []) {
    const json = JSON.stringify(msg)
    for (const conn of this.room.getConnections()) {
      if (!exclude.includes(conn.id)) {
        conn.send(json)
      }
    }
  }
}
