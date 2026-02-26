/**
 * Self-hosted WebSocket Server (Railway-compatible)
 *
 * This is a standalone WebSocket server that replicates PartyKit functionality
 * for deployment on Railway or any Node.js hosting platform.
 *
 * Usage:
 *   pnpm tsx server/websocket-server.ts
 *   or
 *   node server/websocket-server.js (after build)
 */

import { WebSocketServer, WebSocket } from 'ws'
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'

// ---------------------------------------------------------------------------
// Types (same as PartyKit server)
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

// ---------------------------------------------------------------------------
// Room Manager - handles multiple rooms
// ---------------------------------------------------------------------------

interface Client {
  ws: WebSocket
  userId: string
  roomId: string
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
  private clients = new Map<string, WebSocket>()

  constructor(public roomId: string) {
    console.log(`[Room ${roomId}] Created`)
  }

  addClient(userId: string, ws: WebSocket, queryParams: URLSearchParams) {
    const name = queryParams.get('name') ?? `User-${userId.slice(0, 4)}`
    const color = queryParams.get('color') ?? '#3b82f6'

    const user: UserInfo = { userId, name, color }
    this.users.set(userId, user)
    this.clients.set(userId, ws)

    console.log(`[Room ${this.roomId}] User ${name} (${userId}) joined. Total: ${this.clients.size}`)

    // Send room snapshot to new client
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

    // Notify others
    this.broadcast({ type: 'USER_JOIN', user }, userId)
  }

  removeClient(userId: string) {
    this.clients.delete(userId)
    this.users.delete(userId)
    this.cursors.delete(userId)
    this.readyStates.delete(userId)

    console.log(`[Room ${this.roomId}] User ${userId} left. Remaining: ${this.clients.size}`)

    // Release locks
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

  handleMessage(userId: string, msg: IncomingMessage) {
    const ws = this.clients.get(userId)
    if (!ws) return

    switch (msg.type) {
      case 'IDENTIFY': {
        const user: UserInfo = { userId: msg.userId, name: msg.name, color: msg.color }
        this.users.set(msg.userId, user)
        break
      }

      case 'UPDATE_USER': {
        const existing = this.users.get(userId)
        if (!existing) break
        const updated: UserInfo = { userId, name: msg.name, color: msg.color }
        this.users.set(userId, updated)
        const cursor = this.cursors.get(userId)
        if (cursor) {
          this.cursors.set(userId, { ...cursor, name: msg.name, color: msg.color })
        }
        this.broadcast({ type: 'USER_UPDATED', userId, name: msg.name, color: msg.color }, userId)
        break
      }

      case 'SET_CURSOR_MESSAGE': {
        this.cursorMessages.set(userId, msg.message)
        break
      }

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
          userId,
        )
        break
      }

      case 'FIELD_FOCUS': {
        const user = this.users.get(userId)
        if (!user) break
        this.fieldLocks.set(msg.fieldId, userId)
        this.broadcast(
          {
            type: 'FIELD_LOCKED',
            fieldId: msg.fieldId,
            userId,
            userName: user.name,
          },
          userId,
        )
        break
      }

      case 'FIELD_ACTIVITY': {
        const timestamp = Date.now()
        this.broadcast(
          {
            type: 'FIELD_ACTIVITY',
            fieldId: msg.fieldId,
            userId,
            timestamp,
          },
          userId,
        )
        break
      }

      case 'FORCE_FIELD_FOCUS': {
        const user = this.users.get(userId)
        if (!user) break
        this.fieldLocks.set(msg.fieldId, userId)
        this.broadcast({ type: 'FIELD_UNLOCKED', fieldId: msg.fieldId })
        this.broadcast(
          {
            type: 'FIELD_LOCKED',
            fieldId: msg.fieldId,
            userId,
            userName: user.name,
          },
          userId,
        )
        break
      }

      case 'FIELD_BLUR': {
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
          userId,
        )
        break
      }

      case 'PAGE_SCHEMA': {
        this.pageSchema = msg.schema
        this.broadcast({ type: 'REMOTE_PAGE_SCHEMA', schema: msg.schema, userId }, userId)
        break
      }

      case 'DRAFT_FIELD': {
        const draft: DraftSuggestion = {
          fieldId: msg.fieldId,
          value: msg.value,
          source: msg.source,
          reason: msg.reason,
        }
        this.drafts.set(msg.fieldId, draft)
        this.broadcast(
          {
            type: 'REMOTE_DRAFT',
            fieldId: msg.fieldId,
            value: msg.value,
            source: msg.source,
            reason: msg.reason,
          },
          userId,
        )
        break
      }

      case 'ACCEPT_DRAFT': {
        this.drafts.delete(msg.fieldId)
        this.broadcast({ type: 'DRAFT_ACCEPTED', fieldId: msg.fieldId, userId })
        break
      }

      case 'REJECT_DRAFT': {
        this.drafts.delete(msg.fieldId)
        this.broadcast({ type: 'DRAFT_REJECTED', fieldId: msg.fieldId, userId })
        break
      }

      case 'MARK_READY': {
        this.readyStates.set(userId, true)
        this.broadcast({ type: 'READY_STATE_CHANGE', userId, isReady: true })
        break
      }

      case 'UNMARK_READY': {
        this.readyStates.set(userId, false)
        this.broadcast({ type: 'READY_STATE_CHANGE', userId, isReady: false })
        break
      }

      case 'SET_SUBMIT_MODE': {
        this.submitMode = msg.mode
        this.readyStates.clear()
        this.broadcast({ type: 'SUBMIT_MODE_CHANGE', mode: msg.mode })
        break
      }
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
      if (room.isEmpty()) {
        console.log(`[RoomManager] Removing empty room: ${roomId}`)
        this.rooms.delete(roomId)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Server Setup
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || '8080', 10)
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const app = express()

// Enable CORS for development
if (!IS_PRODUCTION) {
  app.use(cors())
}
app.use(express.json())

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: roomManager.rooms.size })
})

// In production, serve the built TanStack app
if (IS_PRODUCTION) {
  const path = await import('path')
  const { fileURLToPath } = await import('url')
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const distPath = path.join(__dirname, '../dist/client')

  console.log(`[Server] Serving static files from: ${distPath}`)
  app.use(express.static(distPath))

  // Fallback to index.html for client-side routing
  app.get('*', (req, res) => {
    // Don't catch WebSocket upgrade requests
    if (req.headers.upgrade === 'websocket') return
    res.sendFile(path.join(distPath, 'index.html'))
  })
} else {
  // Development info endpoint
  app.get('/', (req, res) => {
    res.json({
      message: 'WebSocket server running',
      info: 'Connect via WebSocket to /parties/main/:roomId',
      mode: 'development'
    })
  })
}

const server = createServer(app)
const wss = new WebSocketServer({
  noServer: true, // Handle upgrades manually
})

const roomManager = new RoomManager()
const clientToUserId = new WeakMap<WebSocket, string>()
const clientToRoom = new WeakMap<WebSocket, string>()

// Handle WebSocket upgrade requests
server.on('upgrade', (request, socket, head) => {
  const pathname = request.url?.split('?')[0]

  // Only handle WebSocket upgrades for /parties/main/:roomId paths
  if (pathname && pathname.match(/^\/parties\/main\/.+$/)) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  } else {
    socket.destroy()
  }
})

wss.on('connection', (ws, req) => {
  // Extract room ID from path: /parties/main/:roomId
  const match = req.url?.match(/^\/parties\/main\/([^?]+)/)
  const roomId = match ? decodeURIComponent(match[1]) : 'default-room'

  // Parse query params
  const url = new URL(req.url || '', `http://${req.headers.host}`)
  const queryParams = url.searchParams
  const userId = queryParams.get('userId') || `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  // Store references
  clientToUserId.set(ws, userId)
  clientToRoom.set(ws, roomId)

  // Add to room
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

  ws.on('error', (err) => {
    console.error(`[WebSocket] Error for user ${userId}:`, err)
  })
})

// Clean up empty rooms periodically
setInterval(() => {
  roomManager.removeEmptyRooms()
}, 60000) // Every minute

server.listen(PORT, '0.0.0.0', () => {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`🚀 WebSocket Server running on port ${PORT}`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(``)
  console.log(`WebSocket URL: ws://localhost:${PORT}/parties/main/:roomId`)
  console.log(`Health Check:  http://localhost:${PORT}/health`)
  console.log(``)
  console.log(`Ready for connections!`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
})
