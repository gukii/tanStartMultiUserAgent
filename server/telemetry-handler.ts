/**
 * Telemetry Handler
 *
 * Async ingestion handler for telemetry events.
 * Features:
 * - Batched writes (50-500 events per transaction)
 * - Non-blocking (uses setImmediate for async processing)
 * - Deduplication (via sequence IDs)
 * - Error isolation (telemetry failures don't break collaboration)
 * - PII sanitization based on configuration
 */

import { telemetryDb, schemaTelemetry } from '../src/db/client';
import { eq, and, sql, desc } from 'drizzle-orm';
import type { TelemetryEvent, PiiMode } from '../src/types/telemetry';
import crypto from 'crypto';

const {
  telemetrySessions,
  telemetryParticipants,
  telemetryInteractions,
  telemetryFieldSessions,
  telemetryKeystrokeSequences,
  telemetryCursorMovements,
  telemetryValidationEvents,
  telemetryAiInteractions,
  telemetryConflictEvents,
  telemetryPerformanceMetrics,
  telemetryCollaborativeEdits,
} = schemaTelemetry;

// ============================================================================
// Configuration
// ============================================================================

const FLUSH_THRESHOLD = 500; // Flush when queue reaches this size
const FLUSH_INTERVAL = 5000; // Or flush every 5 seconds
const PII_MODE: PiiMode = (process.env.TELEMETRY_PII_MODE as PiiMode) || 'anonymize';

// ============================================================================
// PII Sanitization
// ============================================================================

function sanitizeValue(value: string | undefined, piiMode: PiiMode = PII_MODE): string | undefined {
  if (!value) return value;

  switch (piiMode) {
    case 'omit':
      return undefined;
    case 'anonymize':
      // Hash using SHA-256
      return crypto.createHash('sha256').update(value).digest('hex').substring(0, 16);
    case 'capture':
    default:
      return value;
  }
}

// ============================================================================
// Telemetry Handler Class
// ============================================================================

export class TelemetryHandler {
  private queue: Array<{
    roomId: string;
    userId: string;
    userName?: string;
    events: TelemetryEvent[];
    sequenceId: number;
  }> = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private processing = false;

  // Track processed sequence IDs to prevent duplicates
  private processedSequences = new Map<string, Set<number>>();

  // Cache participant IDs by session + userId
  private participantCache = new Map<string, number>();

  // Track which fields had errors in previous submission cycle
  private previousCycleErrors = new Map<string, Set<string>>(); // sessionId -> Set<fieldId>

  // Cache field session IDs
  private fieldSessionCache = new Map<string, number>();

  constructor() {
    this.scheduleFlush();
  }

  /**
   * Ingest batch of telemetry events
   */
  async ingestBatch(
    roomId: string,
    userId: string,
    events: TelemetryEvent[],
    sequenceId: number,
    userName?: string
  ): Promise<void> {
    console.log(`[Telemetry] ingestBatch called: roomId=${roomId}, userId=${userId}, userName=${userName}, events=${events.length}, sequence=${sequenceId}`);

    // Check for duplicate sequence
    const key = `${roomId}:${userId}`;
    if (this.processedSequences.get(key)?.has(sequenceId)) {
      console.log(`[Telemetry] Duplicate sequence ${sequenceId} from ${userId}, skipping`);
      return;
    }

    // Add to queue
    this.queue.push({ roomId, userId, userName, events, sequenceId });
    console.log(`[Telemetry] Added to queue. Queue size: ${this.queue.length}`);

    // Mark sequence as processed
    if (!this.processedSequences.has(key)) {
      this.processedSequences.set(key, new Set());
    }
    this.processedSequences.get(key)!.add(sequenceId);

    // Flush if queue is full
    if (this.queue.length >= FLUSH_THRESHOLD) {
      console.log(`[Telemetry] Queue full (${this.queue.length}), flushing...`);
      await this.flush();
    }
  }

  /**
   * Schedule automatic flush
   */
  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = setTimeout(async () => {
      await this.flush();
      this.scheduleFlush(); // Reschedule
    }, FLUSH_INTERVAL);
  }

  /**
   * Flush queue to database
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    if (this.processing) return; // Prevent concurrent flushes

    this.processing = true;

    const batch = this.queue.splice(0); // Take all queued items

    try {
      console.log(`[Telemetry] Flushing ${batch.length} batches...`);

      for (const item of batch) {
        await this.processBatch(item.roomId, item.userId, item.userName, item.events);
      }

      console.log(`[Telemetry] Flush complete`);
    } catch (error) {
      console.error('[Telemetry] Flush error:', error);
      // Don't throw - telemetry failures should be silent
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process a single batch of events
   */
  private async processBatch(roomId: string, userId: string, userName: string | undefined, events: TelemetryEvent[]): Promise<void> {
    // Ensure session and participant exist
    const sessionId = await this.ensureSession(roomId);
    const participantId = await this.ensureParticipant(sessionId, userId, userName);

    // Process events
    for (const event of events) {
      try {
        await this.processEvent(sessionId, participantId, event);
      } catch (error) {
        console.error(`[Telemetry] Error processing event ${event.eventType}:`, error);
        // Continue with next event
      }
    }

    // Update participant metrics
    await this.updateParticipantMetrics(participantId, events.length);
  }

  /**
   * Ensure session exists
   */
  private async ensureSession(roomId: string): Promise<string> {
    const sessionId = roomId; // Use roomId as sessionId

    // Check if session exists
    const existing = await telemetryDb.query.telemetrySessions.findFirst({
      where: eq(telemetrySessions.id, sessionId),
    });

    if (!existing) {
      // Extract route from roomId (e.g., "invoice-edit-123" -> "invoice/edit")
      const route = roomId.split('-').slice(0, 2).join('/');

      await telemetryDb.insert(telemetrySessions).values({
        id: sessionId,
        roomId,
        route,
        submitMode: 'any',
        startedAt: new Date(),
        totalParticipants: 0,
        totalInteractions: 0,
      });
    }

    return sessionId;
  }

  /**
   * Ensure participant exists
   */
  private async ensureParticipant(sessionId: string, userId: string, userName?: string): Promise<number> {
    const cacheKey = `${sessionId}:${userId}`;

    // Check cache
    if (this.participantCache.has(cacheKey)) {
      return this.participantCache.get(cacheKey)!;
    }

    // Check database
    const existing = await telemetryDb.query.telemetryParticipants.findFirst({
      where: and(
        eq(telemetryParticipants.sessionId, sessionId),
        eq(telemetryParticipants.userId, userId)
      ),
    });

    if (existing) {
      this.participantCache.set(cacheKey, existing.id);
      return existing.id;
    }

    // Create new participant
    const [newParticipant] = await telemetryDb
      .insert(telemetryParticipants)
      .values({
        sessionId,
        userId,
        userName: userName || userId, // Use provided userName or fall back to userId
        joinedAt: new Date(),
        totalInteractions: 0,
        totalKeystrokes: 0,
        totalFieldsEdited: 0,
        totalValidationErrors: 0,
        aiDraftsAccepted: 0,
        aiDraftsRejected: 0,
      })
      .returning();

    // Increment session participant count
    await telemetryDb
      .update(telemetrySessions)
      .set({
        totalParticipants: sql`${telemetrySessions.totalParticipants} + 1`,
      })
      .where(eq(telemetrySessions.id, sessionId));

    this.participantCache.set(cacheKey, newParticipant.id);
    return newParticipant.id;
  }

  /**
   * Process individual event
   */
  private async processEvent(sessionId: string, participantId: number, event: TelemetryEvent): Promise<void> {
    // Store raw interaction
    await telemetryDb.insert(telemetryInteractions).values({
      sessionId,
      participantId,
      timestamp: new Date(event.timestamp),
      sequenceId: event.sequenceId,
      eventType: event.eventType,
      eventCategory: event.eventCategory,
      fieldId: event.fieldId,
      fieldType: event.fieldType,
      data: JSON.stringify(event.data || {}),
    });

    // Process specific event types
    switch (event.eventCategory) {
      case 'cursor':
        if (event.eventType === 'cursor_move') {
          await this.processCursorMove(sessionId, participantId, event);
        }
        break;

      case 'field':
        if (event.eventType === 'field_focus') {
          await this.startFieldSession(sessionId, participantId, event);
        } else if (event.eventType === 'field_blur') {
          await this.endFieldSession(sessionId, participantId, event);
        } else if (event.eventType === 'field_input') {
          await this.processKeystroke(event);
        }
        break;

      case 'validation':
        await this.processValidation(sessionId, participantId, event);
        break;

      case 'draft':
        await this.processDraft(sessionId, participantId, event);
        break;

      case 'conflict':
        await this.processConflict(sessionId, participantId, event);
        break;

      case 'performance':
        await this.processPerformance(sessionId, participantId, event);
        break;
    }
  }

  /**
   * Process cursor movement
   */
  private async processCursorMove(sessionId: string, participantId: number, event: TelemetryEvent): Promise<void> {
    const data = event.data as any;

    await telemetryDb.insert(telemetryCursorMovements).values({
      sessionId,
      participantId,
      timestamp: new Date(event.timestamp),
      x: data.x,
      y: data.y,
      scrollX: data.scrollX || 0,
      scrollY: data.scrollY || 0,
      activeFieldId: data.activeFieldId,
    });
  }

  /**
   * Start field session
   */
  private async startFieldSession(sessionId: string, participantId: number, event: TelemetryEvent): Promise<void> {
    if (!event.fieldId) return;

    const data = event.data as any;

    const [fieldSession] = await telemetryDb
      .insert(telemetryFieldSessions)
      .values({
        sessionId,
        participantId,
        fieldId: event.fieldId,
        fieldType: data.fieldType || 'text',
        fieldLabel: data.fieldLabel,
        aiIntent: data.aiIntent,
        focusedAt: new Date(event.timestamp),
        initialValue: sanitizeValue(data.initialValue),
        keystrokeCount: 0,
        pasteCount: 0,
        editCount: 0,
        wasCompleted: false,
        hadValidationError: false,
        aiDraftOffered: false,
        aiDraftAccepted: false,
      })
      .returning();

    // Cache field session ID
    const cacheKey = `${sessionId}:${participantId}:${event.fieldId}`;
    this.fieldSessionCache.set(cacheKey, fieldSession.id);
  }

  /**
   * End field session
   */
  private async endFieldSession(sessionId: string, participantId: number, event: TelemetryEvent): Promise<void> {
    if (!event.fieldId) return;

    const data = event.data as any;
    const cacheKey = `${sessionId}:${participantId}:${event.fieldId}`;
    const fieldSessionId = this.fieldSessionCache.get(cacheKey);

    if (!fieldSessionId) return;

    await telemetryDb
      .update(telemetryFieldSessions)
      .set({
        blurredAt: new Date(event.timestamp),
        durationMs: data.durationMs,
        finalValue: sanitizeValue(data.finalValue),
        wasCompleted: data.wasCompleted,
      })
      .where(eq(telemetryFieldSessions.id, fieldSessionId));

    // Clear cache
    this.fieldSessionCache.delete(cacheKey);
  }

  /**
   * Process keystroke
   */
  private async processKeystroke(event: TelemetryEvent): Promise<void> {
    // Keystroke processing would require field session ID
    // For simplicity, we'll store it in the raw interactions table
    // Advanced processing can be done later
  }

  /**
   * Process validation event
   */
  private async processValidation(sessionId: string, participantId: number, event: TelemetryEvent): Promise<void> {
    if (!event.fieldId) return;

    const data = event.data as any;

    await telemetryDb.insert(telemetryValidationEvents).values({
      sessionId,
      participantId,
      timestamp: new Date(event.timestamp),
      fieldId: event.fieldId,
      errorType: data.errorType || 'unknown',
      errorMessage: data.errorMessage || '',
      attemptedValue: sanitizeValue(data.attemptedValue),
    });
  }

  /**
   * Process AI draft event
   */
  private async processDraft(sessionId: string, participantId: number, event: TelemetryEvent): Promise<void> {
    if (!event.fieldId) return;

    const data = event.data as any;

    await telemetryDb.insert(telemetryAiInteractions).values({
      sessionId,
      participantId,
      draftId: data.draftId || `draft_${Date.now()}`,
      fieldId: event.fieldId,
      requestedAt: new Date(event.timestamp),
      suggestedValue: sanitizeValue(data.suggestedValue),
      userAction: event.eventType.replace('draft_', ''),
    });
  }

  /**
   * Process conflict event
   */
  private async processConflict(sessionId: string, participantId: number, event: TelemetryEvent): Promise<void> {
    if (!event.fieldId) return;

    const data = event.data as any;

    await telemetryDb.insert(telemetryConflictEvents).values({
      sessionId,
      timestamp: new Date(event.timestamp),
      fieldId: event.fieldId,
      requestingParticipantId: participantId,
      conflictType: data.conflictType || 'lock_denied',
    });
  }

  /**
   * Process performance event
   */
  private async processPerformance(sessionId: string, participantId: number, event: TelemetryEvent): Promise<void> {
    const data = event.data as any;

    await telemetryDb.insert(telemetryPerformanceMetrics).values({
      sessionId,
      participantId,
      timestamp: new Date(event.timestamp),
      memoryUsedMB: data.memoryUsedMB,
      memoryLimitMB: data.memoryLimitMB,
      wsLatencyMs: data.wsLatencyMs,
      wsMessageQueueSize: data.wsMessageQueueSize,
      fps: data.fps,
      longTaskCount: data.longTaskCount,
      customMetrics: JSON.stringify(data.customMetrics || {}),
    });
  }

  /**
   * Track collaborative field edit
   */
  async trackCollaborativeEdit(
    roomId: string,
    fieldId: string,
    userId: string,
    userName: string,
    valueBefore: string,
    valueAfter: string,
    previousUserId: string,
    previousUserName: string,
    hadValidationError: boolean = false,
    editDurationMs: number = 0
  ): Promise<void> {
    const sessionId = roomId;

    // Get participant IDs
    const participantId = await this.ensureParticipant(sessionId, userId, userName);
    const previousParticipantId = await this.ensureParticipant(sessionId, previousUserId, previousUserName);

    // Determine edit type based on value changes
    const editType = this.determineEditType(valueBefore, valueAfter);

    // Calculate metrics
    const valueChangePercent = this.calculateValueChangePercent(valueBefore, valueAfter);

    // For collaborative edits, capture actual values to enable meaningful drill-down analysis
    // In production, this could be configurable per-session or per-field
    const sanitizedBefore = sanitizeValue(valueBefore, 'capture');
    const sanitizedAfter = sanitizeValue(valueAfter, 'capture');

    // Store collaborative edit
    await telemetryDb.insert(telemetryCollaborativeEdits).values({
      sessionId,
      fieldId,
      timestamp: new Date(),
      participantId,
      userId,
      userName,
      valueBefore: sanitizedBefore,
      valueAfter: sanitizedAfter,
      editType,
      previousParticipantId,
      previousUserId,
      previousUserName,
      hadValidationError, // Passed from server based on validation state
      fixedValidationError: false, // Will be updated retroactively via markValidationFixed
      introducedValidationError: false, // Will be updated retroactively via markValidationIntroduced
      editDurationMs: editDurationMs > 0 ? editDurationMs : null,
      valueChangePercent,
    });

    console.log(`[Telemetry] Tracked collaborative edit: ${userName} edited ${fieldId} after ${previousUserName} (${editType})`);
  }

  /**
   * Mark the most recent collaborative edit for a field as fixing a validation error
   */
  async markValidationFixed(
    roomId: string,
    fieldId: string,
    userId: string
  ): Promise<void> {
    const sessionId = roomId;

    // Find the most recent collaborative edit ID for this field by this user
    const recentEdit = await telemetryDb
      .select({ id: telemetryCollaborativeEdits.id })
      .from(telemetryCollaborativeEdits)
      .where(
        and(
          eq(telemetryCollaborativeEdits.sessionId, sessionId),
          eq(telemetryCollaborativeEdits.fieldId, fieldId),
          eq(telemetryCollaborativeEdits.userId, userId)
        )
      )
      .orderBy(sql`${telemetryCollaborativeEdits.timestamp} DESC`)
      .limit(1);

    if (recentEdit.length > 0) {
      await telemetryDb
        .update(telemetryCollaborativeEdits)
        .set({
          fixedValidationError: true,
        })
        .where(eq(telemetryCollaborativeEdits.id, recentEdit[0].id));

      console.log(`[Telemetry] Marked validation as fixed: ${userId} fixed ${fieldId}`);
    }
  }

  /**
   * Mark the most recent collaborative edit for a field as introducing a validation error
   */
  async markValidationIntroduced(
    roomId: string,
    fieldId: string,
    userId: string,
    errorMessage?: string
  ): Promise<void> {
    const sessionId = roomId;

    // Find the most recent collaborative edit ID for this field by this user
    const recentEdit = await telemetryDb
      .select({ id: telemetryCollaborativeEdits.id })
      .from(telemetryCollaborativeEdits)
      .where(
        and(
          eq(telemetryCollaborativeEdits.sessionId, sessionId),
          eq(telemetryCollaborativeEdits.fieldId, fieldId),
          eq(telemetryCollaborativeEdits.userId, userId)
        )
      )
      .orderBy(sql`${telemetryCollaborativeEdits.timestamp} DESC`)
      .limit(1);

    if (recentEdit.length > 0) {
      await telemetryDb
        .update(telemetryCollaborativeEdits)
        .set({
          introducedValidationError: true,
        })
        .where(eq(telemetryCollaborativeEdits.id, recentEdit[0].id));

      console.log(`[Telemetry] Marked validation as introduced: ${userId} broke ${fieldId} - ${errorMessage || 'unknown error'}`);
    }
  }

  /**
   * Determine edit type based on value changes
   */
  private determineEditType(valueBefore: string, valueAfter: string): string {
    if (!valueBefore || valueBefore.length === 0) {
      return 'new';
    }

    if (valueAfter.startsWith(valueBefore)) {
      return 'extend';
    }

    if (valueBefore.startsWith(valueAfter) && valueAfter.length < valueBefore.length) {
      return 'shorten';
    }

    return 'replace';
  }

  /**
   * Calculate percentage of value that changed
   */
  private calculateValueChangePercent(valueBefore: string, valueAfter: string): number {
    if (!valueBefore) return 100;
    if (valueBefore === valueAfter) return 0;

    // Simple Levenshtein-like calculation
    const maxLen = Math.max(valueBefore.length, valueAfter.length);
    const minLen = Math.min(valueBefore.length, valueAfter.length);

    let differences = Math.abs(valueBefore.length - valueAfter.length);

    for (let i = 0; i < minLen; i++) {
      if (valueBefore[i] !== valueAfter[i]) {
        differences++;
      }
    }

    return Math.round((differences / maxLen) * 100);
  }

  /**
   * Update participant metrics
   */
  private async updateParticipantMetrics(participantId: number, eventCount: number): Promise<void> {
    // Simple increment - could be more sophisticated
    await telemetryDb
      .update(telemetryParticipants)
      .set({
        totalInteractions: eventCount, // Should be incremented, not replaced
      })
      .where(eq(telemetryParticipants.id, participantId));
  }

  /**
   * Cleanup old data (retention policy)
   */
  async cleanup(retentionDays: number = 90): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.setDate(cutoffDate.getDate() - retentionDays));

    // Delete old sessions (CASCADE will handle related data)
    await telemetryDb
      .delete(telemetrySessions)
      .where(eq(telemetrySessions.startedAt, cutoffDate));

    console.log(`[Telemetry] Cleaned up data older than ${retentionDays} days`);
  }

  /**
   * Track grouped action sequence (replaces keystroke-level tracking)
   * Note: Validation errors are NOT tracked here - they're marked at submission time
   */
  async trackActionSequence(data: {
    sessionId: string
    submissionCycleId: string
    fieldId: string
    userId: string
    userName: string
    previousUserId?: string
    previousUserName?: string
    valueBefore: string
    valueAfter: string
    actionType: string
    startTimestamp: number
    endTimestamp: number
    durationMs: number
    keystrokeCount: number
  }): Promise<void> {
    const sessionId = data.sessionId
    const participantId = await this.ensureParticipant(sessionId, data.userId, data.userName)
    const previousParticipantId = data.previousUserId
      ? await this.ensureParticipant(sessionId, data.previousUserId, data.previousUserName)
      : null

    // Calculate value change percentage
    const valueChangePercent = this.calculateValueChangePercent(data.valueBefore, data.valueAfter)

    // Don't mark errors during editing - only at submission time
    // This allows us to properly track which user's action led to submission error
    // and which user fixed it in the next cycle

    // Store action sequence
    await telemetryDb.insert(schemaTelemetry.telemetryActionSequences).values({
      sessionId,
      submissionCycleId: data.submissionCycleId,
      fieldId: data.fieldId,
      timestamp: new Date(data.startTimestamp),
      completedAt: new Date(data.endTimestamp),
      durationMs: data.durationMs,
      participantId,
      userId: data.userId,
      userName: data.userName,
      previousParticipantId,
      previousUserId: data.previousUserId,
      previousUserName: data.previousUserName,
      valueBefore: sanitizeValue(data.valueBefore, 'capture'),
      valueAfter: sanitizeValue(data.valueAfter, 'capture'),
      actionType: data.actionType,
      hadValidationError: false, // Will be set at submission time
      fixedValidationError: false, // Will be set at submission time
      introducedValidationError: false, // Will be set at submission time
      keystrokeCount: data.keystrokeCount,
      valueChangePercent,
    })

    console.log(
      `[Telemetry] Tracked action sequence: ${data.userName} ${data.actionType} ${data.fieldId} ` +
      `(${data.keystrokeCount} keystrokes, ${data.durationMs}ms)`
    )
  }

  /**
   * Start a new submission cycle
   */
  async startSubmissionCycle(sessionId: string, cycleId: string): Promise<void> {
    await telemetryDb.insert(schemaTelemetry.telemetrySubmissionCycles).values({
      id: cycleId,
      sessionId,
      startedAt: new Date(),
      totalParticipants: 0,
      totalFields: 0,
      totalActions: 0,
      actionsNew: 0,
      actionsExtend: 0,
      actionsReplace: 0,
      actionsShorten: 0,
      errorsFixed: 0,
      errorsBroke: 0,
    })

    console.log(`[Telemetry] Started submission cycle: ${cycleId}`)
  }

  /**
   * End submission cycle and calculate metrics
   */
  async endSubmissionCycle(
    sessionId: string,
    cycleId: string,
    submittedBy: string,
    submittedByName: string,
    finalFieldValues?: Map<string, string>,
    fieldsWithErrors?: Set<string>,
    fieldsWithErrorsInCycle?: Set<string>
  ): Promise<void> {
    // Get all actions for this cycle
    const actions = await telemetryDb
      .select()
      .from(schemaTelemetry.telemetryActionSequences)
      .where(eq(schemaTelemetry.telemetryActionSequences.submissionCycleId, cycleId))

    if (actions.length === 0) {
      console.log(`[Telemetry] No actions found for cycle ${cycleId}, skipping metrics`)
      return
    }

    // Get previous cycle's error fields
    const previousErrors = this.previousCycleErrors.get(sessionId) || new Set<string>()

    // Collect current cycle's fields with errors at submission time (should be empty if successful)
    const currentErrorFields = fieldsWithErrors || new Set<string>()

    // Collect fields that had errors at any point during this cycle (for fix detection)
    const errorsInCycle = fieldsWithErrorsInCycle || new Set<string>()

    // Mark final submitted values and error/fix status
    if (finalFieldValues) {
      for (const [fieldId, finalValue] of finalFieldValues.entries()) {
        // Find the last action on this field in this cycle
        const fieldActions = actions
          .filter(a => a.fieldId === fieldId)
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

        if (fieldActions.length > 0) {
          const lastAction = fieldActions[0]

          // Check if this action's valueAfter matches the final submitted value
          const isFinalValue = lastAction.valueAfter === finalValue

          // Determine error status
          const hasErrorNow = currentErrorFields.has(fieldId)
          const hadErrorBefore = previousErrors.has(fieldId)
          const hadErrorInCycle = errorsInCycle.has(fieldId)

          const updateData: any = {}

          if (isFinalValue) {
            updateData.isFinalSubmittedValue = true
          }

          // Mark as "introduced error" if field has error now
          if (hasErrorNow) {
            updateData.introducedValidationError = true
            console.log(`[Telemetry] Field ${fieldId} has validation error (action by ${lastAction.userName})`)
          }

          // Mark as "fixed error" if field had error before (in previous cycle OR in this cycle) but not anymore
          if ((hadErrorBefore || hadErrorInCycle) && !hasErrorNow) {
            updateData.fixedValidationError = true
            console.log(`[Telemetry] Field ${fieldId} error was fixed (action by ${lastAction.userName})`)
          }

          if (Object.keys(updateData).length > 0) {
            await telemetryDb
              .update(schemaTelemetry.telemetryActionSequences)
              .set(updateData)
              .where(eq(schemaTelemetry.telemetryActionSequences.id, lastAction.id))
          }
        }
      }
    }

    // Store current errors for next cycle
    this.previousCycleErrors.set(sessionId, currentErrorFields)

    // Calculate metrics
    const participants = new Set(actions.map(a => a.userId))
    const fields = new Set(actions.map(a => a.fieldId))

    const actionCounts = {
      new: actions.filter(a => a.actionType === 'new').length,
      extend: actions.filter(a => a.actionType === 'extend').length,
      insert: actions.filter(a => a.actionType === 'insert').length,
      edit: actions.filter(a => a.actionType === 'edit').length,
      replace: actions.filter(a => a.actionType === 'replace').length,
      delete: actions.filter(a => a.actionType === 'delete').length,
      shorten: actions.filter(a => a.actionType === 'shorten').length,
    }

    const errorsFixed = actions.filter(a => a.fixedValidationError).length
    const errorsBroke = actions.filter(a => a.introducedValidationError).length

    // Calculate accuracy: % of fields without errors
    const errorFieldsSet = new Set(
      actions.filter(a => a.hadValidationError || a.introducedValidationError).map(a => a.fieldId)
    )
    const accuracy = ((fields.size - errorFieldsSet.size) / fields.size) * 100

    // Calculate collaboration score (weighted formula)
    // Factors: accuracy (40%), collaboration efficiency (30%), error correction (30%)
    const collaborationEfficiency = Math.min((participants.size / fields.size) * 100, 100)
    const errorCorrectionRate = errorsBroke > 0 ? (errorsFixed / (errorsFixed + errorsBroke)) * 100 : 100

    const collaborationScore = (
      accuracy * 0.4 +
      collaborationEfficiency * 0.3 +
      errorCorrectionRate * 0.3
    )

    // Get start time from first action
    const startTime = Math.min(...actions.map(a => a.timestamp.getTime()))
    const endTime = Date.now()
    const durationMs = endTime - startTime

    // Update cycle with metrics
    await telemetryDb
      .update(schemaTelemetry.telemetrySubmissionCycles)
      .set({
        submittedAt: new Date(),
        durationMs,
        submittedBy,
        submittedByName,
        totalParticipants: participants.size,
        totalFields: fields.size,
        totalActions: actions.length,
        actionsNew: actionCounts.new,
        actionsExtend: actionCounts.extend,
        actionsInsert: actionCounts.insert,
        actionsEdit: actionCounts.edit,
        actionsReplace: actionCounts.replace,
        actionsDelete: actionCounts.delete,
        actionsShorten: actionCounts.shorten,
        errorsFixed,
        errorsBroke,
        accuracy,
        collaborationScore,
      })
      .where(eq(schemaTelemetry.telemetrySubmissionCycles.id, cycleId))

    console.log(
      `[Telemetry] Ended submission cycle ${cycleId}: ` +
      `${participants.size} participants, ${fields.size} fields, ${actions.length} actions, ` +
      `accuracy: ${accuracy.toFixed(1)}%, score: ${collaborationScore.toFixed(1)}`
    )
  }

  /**
   * Mark the last action on a field as having introduced a validation error
   * (used when form submission reveals fields with errors)
   */
  async markFieldErrorAtSubmission(
    sessionId: string,
    cycleId: string,
    fieldId: string
  ): Promise<void> {
    // Find the most recent action on this field in this cycle
    const recentActions = await telemetryDb
      .select()
      .from(schemaTelemetry.telemetryActionSequences)
      .where(
        and(
          eq(schemaTelemetry.telemetryActionSequences.sessionId, sessionId),
          eq(schemaTelemetry.telemetryActionSequences.submissionCycleId, cycleId),
          eq(schemaTelemetry.telemetryActionSequences.fieldId, fieldId)
        )
      )
      .orderBy(desc(schemaTelemetry.telemetryActionSequences.timestamp))
      .limit(1)

    if (recentActions.length > 0) {
      const lastAction = recentActions[0]

      // Only mark as introduced error if it wasn't already marked
      if (!lastAction.introducedValidationError) {
        await telemetryDb
          .update(schemaTelemetry.telemetryActionSequences)
          .set({
            introducedValidationError: true,
          })
          .where(eq(schemaTelemetry.telemetryActionSequences.id, lastAction.id))

        console.log(
          `[Telemetry] Marked field ${fieldId} last action as having error at submission ` +
          `(action by ${lastAction.userName})`
        )
      }
    }
  }
}

// Singleton instance
export const telemetryHandler = new TelemetryHandler();
