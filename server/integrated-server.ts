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
// Room Management (same as standalone WebSocket server)
// ---------------------------------------------------------------------------

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

  constructor(public roomId: string) {}

  addClient(userId: string, ws: WebSocket, queryParams: URLSearchParams) {
    const name = queryParams.get('name') ?? `User-${userId.slice(0, 4)}`
    const color = queryParams.get('color') ?? '#3b82f6'

    const user: UserInfo = { userId, name, color }
    this.users.set(userId, user)
    this.clients.set(userId, ws)

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
    const command = 'pnpm'
    const args = IS_PRODUCTION
      ? ['vite', 'preview', '--port', TANSTACK_PORT.toString(), '--host', '127.0.0.1']
      : ['vite', 'dev', '--port', TANSTACK_PORT.toString()]

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
  const match = req.url?.match(/^\/parties\/main\/([^?]+)/)
  const roomId = match ? decodeURIComponent(match[1]) : 'default-room'

  const url = new URL(req.url || '', `http://${req.headers.host}`)
  const queryParams = url.searchParams
  const userId = queryParams.get('userId') || `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

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

    // Always start TanStack Start server and proxy to it
    // (TanStack Start is an SSR framework, needs to run as a server)
    console.log(`[Startup] Starting TanStack Start server...`)
    await startTanStackServer()

    app.use(
      createProxyMiddleware({
        target: `http://127.0.0.1:${TANSTACK_PORT}`,
        changeOrigin: true,
        ws: false,
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
      }),
    )

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
