import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Core primitives
// ---------------------------------------------------------------------------

export interface CursorPosition {
  /** 0–1 relative to the harness container width */
  x: number
  /** 0–1 relative to the harness container height */
  y: number
  /** id or name of the field the cursor is hovering over */
  activeField?: string
  /** 0–1 relative to the field's width */
  fieldRelativeX?: number
  /** 0–1 relative to the field's height */
  fieldRelativeY?: number
}

export interface UserInfo {
  userId: string
  name: string
  color: string
}

export interface CursorState extends UserInfo, CursorPosition {
  lastSeen: number
  message?: string // Optional coaching message shown next to cursor
}

// ---------------------------------------------------------------------------
// Semantic map (MutationObserver output)
// ---------------------------------------------------------------------------

export interface FieldSchema {
  /** Stable identifier: element id → name → generated index key */
  id: string
  name: string
  /** input type, "textarea", "select", "button", or "contenteditable" */
  type: string
  placeholder: string
  /** Text of an associated <label for="…"> or parent <label> */
  label: string
  ariaLabel: string
  /** Value of data-ai-intent attribute – guidance for the AI Agent */
  aiIntent?: string
}

// ---------------------------------------------------------------------------
// Field & draft state
// ---------------------------------------------------------------------------

export interface FieldValue {
  value: string
  updatedBy: string
  /** Unix ms timestamp – used for CRDT last-write-wins resolution */
  updatedAt: number
}

export interface DraftSuggestion {
  fieldId: string
  /** Suggested value from the AI Agent */
  value: string
  /** Display name of the source (e.g. "AI Assistant") */
  source: string
  /** Optional explanation shown in the suggestion bubble */
  reason?: string
}

// ---------------------------------------------------------------------------
// Full room snapshot (sent on join)
// ---------------------------------------------------------------------------

export interface RoomState {
  users: Record<string, UserInfo>
  cursors: Record<string, CursorState>
  fieldValues: Record<string, FieldValue>
  pageSchema: FieldSchema[]
  drafts: Record<string, DraftSuggestion>
  submitMode: 'any' | 'consensus'
  readyStates: Record<string, boolean> // userId -> isReady
  fieldLocks: Record<string, string> // fieldId -> userId who has focus
}

// ---------------------------------------------------------------------------
// Historical guardrails (TanStack Server Function payload)
// ---------------------------------------------------------------------------

export interface FieldBehaviorHint {
  typicalValues?: string[]
  validationRules?: string
  description?: string
}

export interface NormalBehaviorData {
  route: string
  fields: Record<string, FieldBehaviorHint>
}

// ---------------------------------------------------------------------------
// WebSocket message union  (client → server and server → client)
// ---------------------------------------------------------------------------

/** Messages the client sends to the server */
export type ClientMessage =
  | { type: 'IDENTIFY'; userId: string; name: string; color: string }
  | { type: 'UPDATE_USER'; name: string; color: string }
  | { type: 'SET_CURSOR_MESSAGE'; message: string }
  | { type: 'CURSOR_MOVE'; position: CursorPosition }
  | { type: 'FIELD_FOCUS'; fieldId: string }
  | { type: 'FIELD_BLUR'; fieldId: string }
  | { type: 'FIELD_ACTIVITY'; fieldId: string } // Notify others that we're actively typing
  | { type: 'FORCE_FIELD_FOCUS'; fieldId: string } // Double-click to steal lock
  | { type: 'UPDATE_FIELD'; fieldId: string; value: string; timestamp: number }
  | { type: 'PAGE_SCHEMA'; schema: FieldSchema[] }
  | { type: 'DRAFT_FIELD'; fieldId: string; value: string; source: string; reason?: string }
  | { type: 'ACCEPT_DRAFT'; fieldId: string }
  | { type: 'REJECT_DRAFT'; fieldId: string }
  | { type: 'MARK_READY' }
  | { type: 'UNMARK_READY' }
  | { type: 'SET_SUBMIT_MODE'; mode: 'any' | 'consensus' }

/** Messages the server sends to clients */
export type ServerMessage =
  | { type: 'ROOM_STATE'; state: RoomState }
  | { type: 'USER_JOIN'; user: UserInfo }
  | { type: 'USER_LEAVE'; userId: string }
  | { type: 'USER_UPDATED'; userId: string; name: string; color: string }
  | { type: 'REMOTE_CURSOR'; userId: string; position: CursorPosition; name: string; color: string; message?: string }
  | { type: 'FIELD_LOCKED'; fieldId: string; userId: string; userName: string }
  | { type: 'FIELD_UNLOCKED'; fieldId: string }
  | { type: 'FIELD_ACTIVITY'; fieldId: string; userId: string; timestamp: number }
  | { type: 'REMOTE_FIELD_UPDATE'; fieldId: string; value: string; userId: string; timestamp: number }
  | { type: 'REMOTE_PAGE_SCHEMA'; schema: FieldSchema[]; userId: string }
  | { type: 'REMOTE_DRAFT'; fieldId: string; value: string; source: string; reason?: string }
  | { type: 'DRAFT_ACCEPTED'; fieldId: string; userId: string }
  | { type: 'DRAFT_REJECTED'; fieldId: string; userId: string }
  | { type: 'READY_STATE_CHANGE'; userId: string; isReady: boolean }
  | { type: 'SUBMIT_MODE_CHANGE'; mode: 'any' | 'consensus' }

/** Union of all messages (client or server direction) */
export type WSMessage = ClientMessage | ServerMessage

// ---------------------------------------------------------------------------
// CollaborationHarness props
// ---------------------------------------------------------------------------

export interface CollaborationHarnessProps {
  children: ReactNode
  /**
   * Room identifier – defaults to the current URL pathname.
   * Tip: pass a stable ID (e.g. `order-${orderId}`) for persistent rooms.
   */
  roomId?: string
  /** Display name shown on ghost cursors. Defaults to a random adjective–noun pair. */
  userName?: string
  /** Hex color for this user's cursor. Defaults to a random palette color. */
  userColor?: string
  /**
   * PartyKit host. Defaults to `VITE_PARTYKIT_HOST` env var.
   * Local dev: `127.0.0.1:1999`  |  Production: `<project>.<user>.partykit.dev`
   */
  partyKitHost?: string
  /** Set true to render children without any collaboration features active. */
  disabled?: boolean
  /**
   * Submit mode: 'any' allows any peer to submit, 'consensus' requires all peers to mark ready.
   * Defaults to 'any'.
   */
  submitMode?: 'any' | 'consensus'
  /** Called whenever a remote peer (human or AI) updates a field. */
  onFieldUpdate?: (fieldId: string, value: string, userId: string) => void
  /** Called whenever the MutationObserver rebuilds the page schema. */
  onSchemaUpdate?: (schema: FieldSchema[]) => void
}
