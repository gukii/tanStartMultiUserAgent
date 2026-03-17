/**
 * Integrated Server for Railway
 *
 * This server combines:
 * 1. WebSocket server for real-time collaboration (on PORT)
 * 2. Proxy to TanStack Start server for HTTP/SSR (internal)
 *
 * Railway only exposes one port, so this setup allows both services
 * to work together seamlessly.
 */

import { spawn, ChildProcess } from 'child_process'
import { WebSocketServer, WebSocket } from 'ws'
import express from 'express'
import { createServer } from 'http'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { telemetryHandler } from './telemetry-handler'
import { initDatabase } from '../scripts/init-db'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || '3000', 10)
const TANSTACK_PORT = PORT + 1000 // TanStack runs on different internal port
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

console.log(`[Config] Main port: ${PORT}`)
console.log(`[Config] TanStack port: ${TANSTACK_PORT}`)
console.log(`[Config] Environment: ${IS_PRODUCTION ? 'production' : 'development'}`)

// ---------------------------------------------------------------------------
// Types (same as WebSocket server)
// ---------------------------------------------------------------------------

interface CursorPosition {
  x: number
  y: number
  activeField?: string
  fieldRelativeX?: number
  fieldRelativeY?: number
  scrollX?: number
  scrollY?: number
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
  | { type: 'CLEAR_FORM' }
  | { type: 'VALIDATION_STATUS'; fieldId: string; hasError: boolean; errorMessage?: string }
  | { type: 'TELEMETRY_BATCH'; events: any[]; sequenceId: number; userName?: string }

// ---------------------------------------------------------------------------
// Room Management (same as standalone WebSocket server)
// ---------------------------------------------------------------------------

// Edit buffer for grouping keystroke sequences into complete actions
interface EditBuffer {
  fieldId: string
  userId: string
  userName: string
  participantId?: number
  previousUserId?: string
  previousUserName?: string
  previousParticipantId?: number
  initialValue: string
  currentValue: string
  startTimestamp: number
  lastUpdateTimestamp: number
  keystrokeCount: number
  flushTimer?: NodeJS.Timeout
}

class Room {
  private users = new Map<string, UserInfo>()
  private cursors = new Map<string, CursorState>()
  private cursorMessages = new Map<string, string>()
  private fieldValues = new Map<string, FieldValue>()
  private drafts = new Map<string, DraftSuggestion>()
  private pageSchema: FieldSchema[] = []
  private submitMode: 'any' | 'consensus' = 'any'
  private readyStates = new Map<string, boolean>()
  private fieldLocks = new Map<string, string>()
  private validationErrors = new Map<string, { hasError: boolean; errorMessage?: string}>()
  private clients = new Map<string, WebSocket>()

  // Edit buffering for action sequence grouping
  private editBuffers = new Map<string, EditBuffer>() // key: `${fieldId}:${userId}`
  private editBufferTimeout = 5000 // Default 5s timeout (configurable per session)
  private currentSubmissionCycleId: string | null = null

  constructor(public roomId: string) {}

  /**
   * Buffer an edit for eventual grouping into action sequence
   */
  private bufferEdit(fieldId: string, userId: string, userName: string, newValue: string, previousValue: string, previousUserId?: string, previousUserName?: string) {
    const bufferKey = `${fieldId}:${userId}`
    const now = Date.now()

    // Check if different user is editing - flush their buffer first
    const otherUserBufferKey = this.findBufferForField(fieldId, userId)
    if (otherUserBufferKey) {
      this.flushBuffer(otherUserBufferKey, 'different_user_editing')
    }

    // Get or create buffer
    let buffer = this.editBuffers.get(bufferKey)

    if (!buffer) {
      // Start new buffer
      buffer = {
        fieldId,
        userId,
        userName,
        previousUserId,
        previousUserName,
        initialValue: previousValue,
        currentValue: newValue,
        startTimestamp: now,
        lastUpdateTimestamp: now,
        keystrokeCount: 1,
      }
      this.editBuffers.set(bufferKey, buffer)
    } else {
      // Update existing buffer
      buffer.currentValue = newValue
      buffer.lastUpdateTimestamp = now
      buffer.keystrokeCount++

      // Clear existing timeout
      if (buffer.flushTimer) {
        clearTimeout(buffer.flushTimer)
      }
    }

    // Set flush timeout
    buffer.flushTimer = setTimeout(() => {
      this.flushBuffer(bufferKey, 'timeout')
    }, this.editBufferTimeout)
  }

  /**
   * Find if another user has a buffer for this field
   */
  private findBufferForField(fieldId: string, excludeUserId: string): string | null {
    for (const [key, buffer] of this.editBuffers.entries()) {
      if (buffer.fieldId === fieldId && buffer.userId !== excludeUserId) {
        return key
      }
    }
    return null
  }

  /**
   * Flush a buffered edit sequence to create grouped action
   */
  private async flushBuffer(bufferKey: string, reason: string) {
    const buffer = this.editBuffers.get(bufferKey)
    if (!buffer) return

    // Remove from buffers
    this.editBuffers.delete(bufferKey)

    // Clear timeout if exists
    if (buffer.flushTimer) {
      clearTimeout(buffer.flushTimer)
    }

    // Skip if no actual change
    if (buffer.initialValue === buffer.currentValue) {
      console.log(`[Room ${this.roomId}] Skipping empty buffer flush for ${buffer.fieldId} by ${buffer.userName}`)
      return
    }

    const durationMs = buffer.lastUpdateTimestamp - buffer.startTimestamp

    console.log(
      `[Room ${this.roomId}] Flushing buffer for ${buffer.fieldId} by ${buffer.userName} (${reason}): ` +
      `${buffer.keystrokeCount} keystrokes, ${durationMs}ms, "${buffer.initialValue}" -> "${buffer.currentValue}"`
    )

    // Ensure submission cycle exists
    if (!this.currentSubmissionCycleId) {
      await this.startNewSubmissionCycle()
    }

    // Determine action type
    const actionType = this.determineActionType(buffer.initialValue, buffer.currentValue)

    // Store grouped action via telemetry handler (await to ensure it's written before returning)
    // Note: Validation errors are NOT tracked during editing, only at submission time
    try {
      await telemetryHandler.trackActionSequence({
        sessionId: this.roomId,
        submissionCycleId: this.currentSubmissionCycleId!,
        fieldId: buffer.fieldId,
        userId: buffer.userId,
        userName: buffer.userName,
        previousUserId: buffer.previousUserId,
        previousUserName: buffer.previousUserName,
        valueBefore: buffer.initialValue,
        valueAfter: buffer.currentValue,
        actionType,
        startTimestamp: buffer.startTimestamp,
        endTimestamp: buffer.lastUpdateTimestamp,
        durationMs,
        keystrokeCount: buffer.keystrokeCount,
      })
    } catch (error) {
      console.error('[Room] Error flushing buffer to telemetry:', error)
    }
  }

  /**
   * Flush all buffers for a specific field (e.g., on blur)
   */
  private async flushFieldBuffers(fieldId: string, reason: string) {
    const buffersToFlush: string[] = []

    for (const [key, buffer] of this.editBuffers.entries()) {
      if (buffer.fieldId === fieldId) {
        buffersToFlush.push(key)
      }
    }

    for (const key of buffersToFlush) {
      await this.flushBuffer(key, reason)
    }
  }

  /**
   * Determine action type based on value changes
   * Uses diff analysis to detect insertions, edits, extensions, etc.
   */
  private determineActionType(before: string, after: string): string {
    if (!before || before.length === 0) return 'new'
    if (!after || after.length === 0) return 'clear'

    // Simple cases: pure extend or shorten at the end
    if (after.startsWith(before)) return 'extend'
    if (before.startsWith(after)) return 'shorten'

    // Find common prefix (what stays the same at the start)
    let prefixLen = 0
    const minLen = Math.min(before.length, after.length)
    while (prefixLen < minLen && before[prefixLen] === after[prefixLen]) {
      prefixLen++
    }

    // Find common suffix (what stays the same at the end)
    let suffixLen = 0
    while (
      suffixLen < minLen - prefixLen &&
      before[before.length - 1 - suffixLen] === after[after.length - 1 - suffixLen]
    ) {
      suffixLen++
    }

    // Extract the changed parts
    const beforeMiddle = before.substring(prefixLen, before.length - suffixLen)
    const afterMiddle = after.substring(prefixLen, after.length - suffixLen)

    // If both prefix and suffix exist, this is an insertion/edit in the middle
    if (prefixLen > 0 && suffixLen > 0) {
      if (beforeMiddle.length === 0 && afterMiddle.length > 0) {
        // Text was added. Check if original text is fully preserved as a contiguous block
        if (after.includes(before)) {
          // Original text fully preserved (e.g., "Mills" → "Mini-Mills")
          return 'extend'
        } else {
          // Original text split with insertion in middle (e.g., "710 S Church" → "710 St Marx Church")
          return 'insert'
        }
      } else if (beforeMiddle.length > 0 && afterMiddle.length > 0) {
        // Text was replaced in the middle
        return 'edit'
      } else if (beforeMiddle.length > 0 && afterMiddle.length === 0) {
        // Text was removed from the middle
        return 'delete'
      }
    }

    // If only prefix exists (suffix is empty), check what changed at the end
    if (prefixLen > 0 && suffixLen === 0) {
      if (afterMiddle.length > beforeMiddle.length) {
        return 'extend' // Added to the end
      } else {
        return 'shorten' // Removed from the end
      }
    }

    // If only suffix exists (prefix is empty), check what changed at the start
    if (prefixLen === 0 && suffixLen > 0) {
      if (afterMiddle.length > beforeMiddle.length) {
        // Text added at the start. Check if original is fully preserved
        if (beforeMiddle.length === 0 && after.includes(before)) {
          // Prepended text (e.g., "Smith" → "John Smith")
          return 'extend'
        } else {
          // Text added at the start with deletions/changes
          return 'insert'
        }
      } else {
        return 'delete' // Removed from the start
      }
    }

    // Complete replacement (no common parts)
    return 'replace'
  }

  /**
   * Start a new submission cycle
   */
  private async startNewSubmissionCycle() {
    const cycleId = `cycle_${this.roomId}_${Date.now()}`
    this.currentSubmissionCycleId = cycleId

    console.log(`[Room ${this.roomId}] Started new submission cycle: ${cycleId}`)

    setImmediate(async () => {
      try {
        await telemetryHandler.startSubmissionCycle(this.roomId, cycleId)
      } catch (error) {
        console.error('[Room] Error starting submission cycle:', error)
      }
    })
  }

  /**
   * End current submission cycle and calculate metrics
   */
  private async endSubmissionCycle(
    submittedBy: string,
    submittedByName: string,
    fieldsWithErrors: Set<string>
  ) {
    if (!this.currentSubmissionCycleId) return

    // Flush all pending buffers before ending cycle
    const allBufferKeys = Array.from(this.editBuffers.keys())
    for (const key of allBufferKeys) {
      await this.flushBuffer(key, 'form_submission')
    }

    console.log(
      `[Room ${this.roomId}] Ending submission cycle: ${this.currentSubmissionCycleId} by ${submittedByName} ` +
      `(${fieldsWithErrors.size} fields with errors)`
    )

    // Collect final field values at submission time
    const finalFieldValues = new Map<string, string>()
    for (const [fieldId, fieldValue] of this.fieldValues.entries()) {
      finalFieldValues.set(fieldId, fieldValue.value)
    }

    // Calculate metrics and update cycle (wait for this to complete)
    try {
      await telemetryHandler.endSubmissionCycle(
        this.roomId,
        this.currentSubmissionCycleId!,
        submittedBy,
        submittedByName,
        finalFieldValues,
        fieldsWithErrors
      )
    } catch (error) {
      console.error('[Room] Error ending submission cycle:', error)
    }

    // Start new cycle for next form
    this.currentSubmissionCycleId = null
    await this.startNewSubmissionCycle()
  }

  addClient(userId: string, ws: WebSocket, queryParams: URLSearchParams) {
    const name = queryParams.get('name') ?? `User-${userId.slice(0, 4)}`
    const color = queryParams.get('color') ?? '#3b82f6'

    const user: UserInfo = { userId, name, color }
    this.users.set(userId, user)
    this.clients.set(userId, ws)

    // Start submission cycle if this is the first client in the room
    if (this.users.size === 1 && !this.currentSubmissionCycleId) {
      console.log(`[Room ${this.roomId}] First client connected, starting initial submission cycle`)
      this.startNewSubmissionCycle().catch(err => {
        console.error('[Room] Error starting initial submission cycle:', err)
      })
    }

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
    this.send(ws, { type: 'ROOM_STATE', state: snapshot })
    this.broadcast({ type: 'USER_JOIN', user }, userId)
  }

  removeClient(userId: string) {
    this.clients.delete(userId)
    this.users.delete(userId)
    this.cursors.delete(userId)
    this.readyStates.delete(userId)

    const locksToRelease: string[] = []
    for (const [fieldId, lockOwner] of this.fieldLocks.entries()) {
      if (lockOwner === userId) locksToRelease.push(fieldId)
    }
    for (const fieldId of locksToRelease) {
      this.fieldLocks.delete(fieldId)
      this.broadcast({ type: 'FIELD_UNLOCKED', fieldId })
    }

    this.broadcast({ type: 'USER_LEAVE', userId })
  }

  handleMessage(userId: string, msg: IncomingMessage) {
    const ws = this.clients.get(userId)
    if (!ws) return

    switch (msg.type) {
      case 'IDENTIFY':
        this.users.set(msg.userId, { userId: msg.userId, name: msg.name, color: msg.color })
        break
      case 'UPDATE_USER': {
        const user = this.users.get(userId)
        if (!user) break
        user.name = msg.name
        user.color = msg.color
        const cursor = this.cursors.get(userId)
        if (cursor) {
          cursor.name = msg.name
          cursor.color = msg.color
        }
        this.broadcast({ type: 'USER_UPDATED', userId, name: msg.name, color: msg.color }, userId)
        break
      }
      case 'SET_CURSOR_MESSAGE':
        this.cursorMessages.set(userId, msg.message)
        break
      case 'CURSOR_MOVE': {
        const user = this.users.get(userId)
        if (!user) break
        const message = this.cursorMessages.get(userId)
        this.cursors.set(userId, { ...user, ...msg.position, message, lastSeen: Date.now() })
        this.broadcast({ type: 'REMOTE_CURSOR', userId, position: msg.position, name: user.name, color: user.color, message }, userId)
        break
      }
      case 'FIELD_FOCUS': {
        const user = this.users.get(userId)
        if (!user) break
        this.fieldLocks.set(msg.fieldId, userId)
        this.broadcast({ type: 'FIELD_LOCKED', fieldId: msg.fieldId, userId, userName: user.name }, userId)
        break
      }
      case 'FIELD_ACTIVITY':
        this.broadcast({ type: 'FIELD_ACTIVITY', fieldId: msg.fieldId, userId, timestamp: Date.now() }, userId)
        break
      case 'FORCE_FIELD_FOCUS': {
        const user = this.users.get(userId)
        if (!user) break
        this.fieldLocks.set(msg.fieldId, userId)
        this.broadcast({ type: 'FIELD_UNLOCKED', fieldId: msg.fieldId })
        this.broadcast({ type: 'FIELD_LOCKED', fieldId: msg.fieldId, userId, userName: user.name }, userId)
        break
      }
      case 'FIELD_BLUR': {
        // Flush edit buffers for this field when user leaves it (async, non-blocking)
        setImmediate(() => {
          this.flushFieldBuffers(msg.fieldId, 'field_blur').catch(err => {
            console.error('[Room] Error flushing field buffers:', err)
          })
        })

        const lockOwner = this.fieldLocks.get(msg.fieldId)
        if (lockOwner === userId) {
          this.fieldLocks.delete(msg.fieldId)
          this.broadcast({ type: 'FIELD_UNLOCKED', fieldId: msg.fieldId })
        }
        break
      }
      case 'UPDATE_FIELD': {
        const existing = this.fieldValues.get(msg.fieldId)
        if (existing && msg.timestamp < existing.updatedAt) break

        const user = this.users.get(userId)
        const previousUser = existing ? this.users.get(existing.updatedBy) : undefined

        // Buffer edit for action sequence grouping (replaces immediate telemetry)
        this.bufferEdit(
          msg.fieldId,
          userId,
          user?.name || userId,
          msg.value,
          existing?.value || '',
          existing?.updatedBy,
          previousUser?.name
        )

        // Also keep raw keystroke-level tracking for backwards compatibility
        if (existing && existing.updatedBy !== userId) {
          const hadValidationError = this.validationErrors.get(msg.fieldId)?.hasError || false
          const editDurationMs = msg.timestamp - existing.updatedAt

          setImmediate(async () => {
            try {
              await telemetryHandler.trackCollaborativeEdit(
                this.roomId,
                msg.fieldId,
                userId,
                user?.name || userId,
                existing.value,
                msg.value,
                existing.updatedBy,
                previousUser?.name || existing.updatedBy,
                hadValidationError,
                editDurationMs
              )
            } catch (error) {
              console.error('[Server] Error tracking collaborative edit:', error)
            }
          })
        }

        this.fieldValues.set(msg.fieldId, { value: msg.value, updatedBy: userId, updatedAt: msg.timestamp })
        this.broadcast({ type: 'REMOTE_FIELD_UPDATE', fieldId: msg.fieldId, value: msg.value, userId, timestamp: msg.timestamp }, userId)
        break
      }
      case 'PAGE_SCHEMA':
        this.pageSchema = msg.schema
        this.broadcast({ type: 'REMOTE_PAGE_SCHEMA', schema: msg.schema, userId }, userId)
        break
      case 'DRAFT_FIELD':
        this.drafts.set(msg.fieldId, { fieldId: msg.fieldId, value: msg.value, source: msg.source, reason: msg.reason })
        this.broadcast({ type: 'REMOTE_DRAFT', fieldId: msg.fieldId, value: msg.value, source: msg.source, reason: msg.reason }, userId)
        break
      case 'ACCEPT_DRAFT':
        this.drafts.delete(msg.fieldId)
        this.broadcast({ type: 'DRAFT_ACCEPTED', fieldId: msg.fieldId, userId })
        break
      case 'REJECT_DRAFT':
        this.drafts.delete(msg.fieldId)
        this.broadcast({ type: 'DRAFT_REJECTED', fieldId: msg.fieldId, userId })
        break
      case 'MARK_READY':
        this.readyStates.set(userId, true)
        this.broadcast({ type: 'READY_STATE_CHANGE', userId, isReady: true })
        break
      case 'UNMARK_READY':
        this.readyStates.set(userId, false)
        this.broadcast({ type: 'READY_STATE_CHANGE', userId, isReady: false })
        break
      case 'SET_SUBMIT_MODE':
        this.submitMode = msg.mode
        this.readyStates.clear()
        this.broadcast({ type: 'SUBMIT_MODE_CHANGE', mode: msg.mode })
        break
      case 'CLEAR_FORM':
        // Clear all field values, drafts, and ready states
        this.fieldValues.clear()
        this.drafts.clear()
        this.readyStates.clear()
        console.log(`[Room ${this.roomId}] Form cleared by ${userId}`)
        // Broadcast to ALL clients (including the one who initiated)
        this.broadcast({ type: 'FORM_CLEARED' })
        break
      case 'FORM_SUBMITTED': {
        // Collect fields with validation errors at submission time
        const fieldsWithErrorsSet = new Set<string>()
        for (const [fieldId, errorState] of this.validationErrors.entries()) {
          if (errorState.hasError) {
            fieldsWithErrorsSet.add(fieldId)
          }
        }

        // End current submission cycle with metrics (async, non-blocking)
        const user = this.users.get(userId)
        setImmediate(() => {
          this.endSubmissionCycle(userId, user?.name || userId, fieldsWithErrorsSet).catch(err => {
            console.error('[Room] Error ending submission cycle:', err)
          })
        })

        // Broadcast to all other peers that form was submitted
        this.broadcast({ type: 'FORM_SUBMITTED', userId })
        // Clear ready states after submission
        this.readyStates.clear()
        break
      }

      case 'VALIDATION_STATUS': {
        // Track validation error state for collaborative edit analysis
        const previousState = this.validationErrors.get(msg.fieldId)

        this.validationErrors.set(msg.fieldId, {
          hasError: msg.hasError,
          errorMessage: msg.errorMessage,
        })

        // If error was fixed (had error, now doesn't), retroactively update last collaborative edit
        if (previousState?.hasError && !msg.hasError) {
          const fieldValue = this.fieldValues.get(msg.fieldId)
          if (fieldValue) {
            setImmediate(async () => {
              try {
                await telemetryHandler.markValidationFixed(
                  this.roomId,
                  msg.fieldId,
                  fieldValue.updatedBy
                )
              } catch (error) {
                console.error('[Server] Error marking validation fixed:', error)
              }
            })
          }
        }

        // If error was introduced (didn't have error, now does), retroactively update last collaborative edit
        if (!previousState?.hasError && msg.hasError) {
          const fieldValue = this.fieldValues.get(msg.fieldId)
          if (fieldValue) {
            setImmediate(async () => {
              try {
                await telemetryHandler.markValidationIntroduced(
                  this.roomId,
                  msg.fieldId,
                  fieldValue.updatedBy,
                  msg.errorMessage
                )
              } catch (error) {
                console.error('[Server] Error marking validation introduced:', error)
              }
            })
          }
        }
        break
      }

      case 'TELEMETRY_BATCH': {
        console.log(`[Server] Received TELEMETRY_BATCH from ${userId}: ${msg.events.length} events, sequence ${msg.sequenceId}`);

        // Non-blocking telemetry ingestion (async via setImmediate)
        setImmediate(async () => {
          try {
            await telemetryHandler.ingestBatch(
              this.roomId,
              userId,
              msg.events,
              msg.sequenceId,
              msg.userName
            )

            console.log(`[Server] Telemetry batch processed successfully, sending ACK`);

            // Send acknowledgment
            this.send(ws, {
              type: 'TELEMETRY_ACK',
              sequenceId: msg.sequenceId,
              status: 'success',
            })
          } catch (error: any) {
            console.error('[Telemetry] Ingest error:', error)
            // Don't propagate error to WebSocket handler
            this.send(ws, {
              type: 'TELEMETRY_ACK',
              sequenceId: msg.sequenceId,
              status: 'error',
              error: error.message,
            })
          }
        })
        break
      }

      case 'PING':
        // Respond to keepalive ping to prevent connection timeout
        this.send(ws, { type: 'PONG' })
        break
    }
  }

  private send(ws: WebSocket, msg: object) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }

  private broadcast(msg: object, excludeUserId?: string) {
    const json = JSON.stringify(msg)
    for (const [uid, ws] of this.clients.entries()) {
      if (uid !== excludeUserId && ws.readyState === WebSocket.OPEN) {
        ws.send(json)
      }
    }
  }

  isEmpty(): boolean {
    return this.clients.size === 0
  }
}

class RoomManager {
  private rooms = new Map<string, Room>()

  getRoom(roomId: string): Room {
    let room = this.rooms.get(roomId)
    if (!room) {
      room = new Room(roomId)
      this.rooms.set(roomId, room)
    }
    return room
  }

  removeEmptyRooms() {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.isEmpty()) this.rooms.delete(roomId)
    }
  }
}

// ---------------------------------------------------------------------------
// TanStack Start Server Process
// ---------------------------------------------------------------------------

let tanstackProcess: ChildProcess | null = null

function startTanStackServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('[TanStack] Starting server...')

    const env = {
      ...process.env,
      PORT: TANSTACK_PORT.toString(),
      HOST: '127.0.0.1', // Internal only
    }

    // In production, use vite preview to serve the built app
    // In development, run the dev server
    // Always bind to 127.0.0.1 (IPv4) to ensure proxy can connect
    const command = 'pnpm'
    const args = IS_PRODUCTION
      ? ['vite', 'preview', '--port', TANSTACK_PORT.toString(), '--host', '127.0.0.1']
      : ['vite', 'dev', '--port', TANSTACK_PORT.toString(), '--host', '127.0.0.1']

    tanstackProcess = spawn(command, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    tanstackProcess.stdout?.on('data', (data) => {
      console.log(`[TanStack] ${data.toString().trim()}`)
    })

    tanstackProcess.stderr?.on('data', (data) => {
      console.error(`[TanStack] ${data.toString().trim()}`)
    })

    tanstackProcess.on('error', (error) => {
      console.error('[TanStack] Process error:', error)
      reject(error)
    })

    tanstackProcess.on('exit', (code) => {
      console.log(`[TanStack] Process exited with code ${code}`)
    })

    // Wait a bit for the server to start
    setTimeout(() => {
      console.log(`[TanStack] Server should be running on http://127.0.0.1:${TANSTACK_PORT}`)
      resolve()
    }, 3000)
  })
}

// ---------------------------------------------------------------------------
// Integrated Express + WebSocket Server
// ---------------------------------------------------------------------------

const app = express()
const roomManager = new RoomManager()

// Health check (before proxy)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    websocket: 'active',
    rooms: roomManager['rooms'].size,
    tanstackPort: TANSTACK_PORT,
  })
})

// Placeholder - will be configured in start() function
// In dev: proxy to TanStack Start
// In prod: serve static files

const server = createServer(app)

// WebSocket server for /parties/main/:roomId
const wss = new WebSocketServer({
  noServer: true, // Handle upgrades manually
})

// Store proxy reference for WebSocket forwarding
let proxyMiddleware: any = null

wss.on('connection', (ws, req) => {
  const match = req.url?.match(/^\/parties\/main\/([^?]+)/)
  const roomId = match ? decodeURIComponent(match[1]) : 'default-room'

  const url = new URL(req.url || '', `http://${req.headers.host}`)
  const queryParams = url.searchParams
  const userId = queryParams.get('userId') || `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const userName = queryParams.get('name') || 'Anonymous'

  console.log(`[WebSocket] ✓ Connection established`)
  console.log(`[WebSocket]   Room: ${roomId}`)
  console.log(`[WebSocket]   User: ${userName} (${userId})`)

  const room = roomManager.getRoom(roomId)
  room.addClient(userId, ws, queryParams)

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as IncomingMessage
      room.handleMessage(userId, msg)
    } catch (err) {
      console.error('[WebSocket] Parse error:', err)
    }
  })

  ws.on('close', () => {
    room.removeClient(userId)
    roomManager.removeEmptyRooms()
  })
})

// Clean up empty rooms periodically
setInterval(() => roomManager.removeEmptyRooms(), 60000)

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start() {
  try {
    console.log(`[DEBUG] IS_PRODUCTION = ${IS_PRODUCTION}`)
    console.log(`[DEBUG] NODE_ENV = ${process.env.NODE_ENV}`)

    // Initialize telemetry database (create directory and run migrations)
    console.log(`[Startup] Initializing telemetry database...`)
    await initDatabase()

    // Always start TanStack Start server and proxy to it
    // (TanStack Start is an SSR framework, needs to run as a server)
    console.log(`[Startup] Starting TanStack Start server...`)
    await startTanStackServer()

    const proxy = createProxyMiddleware({
        target: `http://127.0.0.1:${TANSTACK_PORT}`,
        changeOrigin: true,
        ws: false, // Disable automatic WebSocket proxying - we handle it manually in server.on('upgrade')
        filter: (pathname) => pathname !== '/health',
        onError: (err, req, res) => {
          console.error('[Proxy] Error:', err.message)
          if (!res.headersSent) {
            res.status(502).json({ error: 'TanStack server not available' })
          }
        },
        onProxyReq: (proxyReq, req) => {
          if (!IS_PRODUCTION) {
            console.log(`[Proxy] ${req.method} ${req.url} -> TanStack:${TANSTACK_PORT}`)
          }
        },
      })

    // Store proxy reference for WebSocket forwarding
    proxyMiddleware = proxy

    app.use(proxy)

    // Handle WebSocket upgrade requests AFTER proxy is configured
    server.on('upgrade', (request, socket, head) => {
      const pathname = request.url?.split('?')[0]

      // Only handle WebSocket upgrades for /parties/main/:roomId paths
      if (pathname && pathname.match(/^\/parties\/main\/.+$/)) {
        console.log(`[WebSocket] ✓ Collaboration WebSocket: ${pathname}`)
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request)
        })
      } else {
        // For other WebSocket connections (e.g., Vite HMR), forward to proxy
        console.log(`[WebSocket] → Forwarding to proxy (Vite HMR): ${pathname}`)
        if (proxyMiddleware && proxyMiddleware.upgrade) {
          proxyMiddleware.upgrade(request, socket, head)
        } else {
          console.error('[WebSocket] Proxy upgrade method not available')
          socket.destroy()
        }
      }
    })

    // Start the integrated server
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(`🚀 Integrated Server running`)
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(``)
      console.log(`Main URL:      http://localhost:${PORT}`)
      console.log(`Health Check:  http://localhost:${PORT}/health`)
      console.log(`WebSocket:     ws://localhost:${PORT}/parties/main/:roomId`)
      console.log(``)
      if (IS_PRODUCTION) {
        console.log(`Static Files → Serving from dist/client`)
      } else {
        console.log(`TanStack Start → http://127.0.0.1:${TANSTACK_PORT} (internal)`)
        console.log(`HTTP Proxy → Forwards requests to TanStack`)
      }
      console.log(`WebSocket Server → Handles /parties/main/* paths`)
      console.log(``)
      console.log(`Ready for connections!`)
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    })
  } catch (error) {
    console.error('[Startup] Failed to start:', error)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Shutdown] Received SIGTERM, closing servers...')
  server.close()
  if (tanstackProcess) tanstackProcess.kill()
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('[Shutdown] Received SIGINT, closing servers...')
  server.close()
  if (tanstackProcess) tanstackProcess.kill()
  process.exit(0)
})

start()
