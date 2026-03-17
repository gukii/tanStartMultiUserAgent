/**
 * Server-side analytics queries
 *
 * Queries the telemetry database to generate performance metrics
 */

import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@libsql/client'
import path from 'node:path'

// Helper to get database connection
function getDb() {
  const dbPath = path.join(process.cwd(), 'data', 'telemetry.db')
  return createClient({
    url: `file:${dbPath}`,
  })
}

interface UserMetrics {
  userId: string
  userName: string
  totalSessions: number
  totalFields: number
  totalValidationErrors: number
  avgFieldsPerSession: number
  avgTimePerField: number
  estimatedTimeForFullForm: number
  formsPerHour: number
  accuracy: number
  aiDraftsAccepted: number
  aiDraftsRejected: number
  aiAcceptanceRate: number
  improvementRate: number
  // Collaborative metrics
  fieldsExtended: number
  fieldsReplaced: number
  errorsFixed: number
  errorsIntroduced: number
  collaborativeScore: number
}

interface CollaborationMetrics {
  sessionId: string
  roomId: string
  route: string
  participants: string[]
  participantCount: number
  submitMode: string
  totalFields: number
  avgFieldsPerUser: number
  completionTime: number
  validationErrors: number
  outcome: string
}

interface FieldPreference {
  fieldId: string
  fieldLabel: string
  totalCompletions: number
  avgCompletionTime: number
  popularityRank: number
}

interface TimeSeriesPoint {
  date: string
  userId: string
  fieldsCompleted: number
  validationErrors: number
  aiAcceptance: number
}

interface AnalyticsData {
  users: UserMetrics[]
  collaborations: CollaborationMetrics[]
  fieldPreferences: FieldPreference[]
  timeSeriesData: TimeSeriesPoint[]
}

export const getAnalytics = createServerFn({ method: 'GET' })
  .inputValidator((data: { timeRange?: string }) => {
    // Validate and normalize the timeRange parameter
    const timeRange = data?.timeRange || '24h'

    if (!['1h', '24h', '7d', '30d'].includes(timeRange)) {
      return { timeRange: '24h' as const }
    }

    return { timeRange: timeRange as '1h' | '24h' | '7d' | '30d' }
  })
  .handler(async ({ data }): Promise<AnalyticsData> => {
    const options = data
    const dbPath = path.join(process.cwd(), 'data', 'telemetry.db')
    const db = createClient({
      url: `file:${dbPath}`,
    })

    try {
      // Calculate time range in milliseconds
      const now = Date.now()
      const timeRangeMs = {
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
      }[options.timeRange]
      const startTimeMs = now - timeRangeMs

      // Convert to seconds for database comparison (telemetry stores Unix timestamps in seconds)
      const startTime = Math.floor(startTimeMs / 1000)

    // Query user metrics using action sequences (new approach)
    // Fall back to field sessions if no action sequences exist (backward compatibility)
    const userResult = await db.execute({
      sql: `
        SELECT
          p.user_id as userId,
          p.user_name as userName,
          COUNT(DISTINCT p.session_id) as totalSessions,
          COUNT(DISTINCT a.field_id) as totalFields,
          SUM(CASE WHEN a.had_validation_error = 1 OR a.introduced_validation_error = 1 THEN 1 ELSE 0 END) as totalValidationErrors,
          0 as aiDraftsAccepted,
          0 as aiDraftsRejected,
          AVG(a.duration_ms) as avgDurationMs,
          COUNT(a.id) as totalActions
        FROM telemetry_participants p
        INNER JOIN telemetry_action_sequences a ON p.id = a.participant_id
        WHERE a.timestamp >= ?
        GROUP BY p.user_id, p.user_name
        HAVING totalFields > 0
        ORDER BY totalFields DESC
      `,
      args: [startTime],
    })
    const userRows = userResult.rows as any[]

    const users: UserMetrics[] = await Promise.all(
      userRows.map(async (row) => {
        const avgTimePerField = row.avgDurationMs ? Number(row.avgDurationMs) / 1000 : 0
        const avgFieldsPerSession = Number(row.totalSessions) > 0 ? Number(row.totalFields) / Number(row.totalSessions) : 0
        const estimatedTimeForFullForm = avgTimePerField * 10 // Assume 10 fields per form
        const formsPerHour = avgTimePerField > 0 ? 3600 / estimatedTimeForFullForm : 0
        const accuracy = Number(row.totalFields) > 0
          ? ((Number(row.totalFields) - Number(row.totalValidationErrors)) / Number(row.totalFields)) * 100
          : 100
        const totalAiInteractions = Number(row.aiDraftsAccepted) + Number(row.aiDraftsRejected)
        const aiAcceptanceRate = totalAiInteractions > 0
          ? (Number(row.aiDraftsAccepted) / totalAiInteractions) * 100
          : 0

        // Calculate improvement rate (simplified - compare first half vs second half of sessions)
        const improvementRate = await calculateImprovementRate(db, String(row.userId), startTime)

        // Get collaborative editing metrics
        const collabMetrics = await getCollaborativeMetrics(db, String(row.userId), startTime)

        return {
          userId: String(row.userId),
          userName: String(row.userName),
          totalSessions: Number(row.totalSessions),
          totalFields: Number(row.totalFields),
          totalValidationErrors: Number(row.totalValidationErrors),
          avgFieldsPerSession,
          avgTimePerField,
          estimatedTimeForFullForm,
          formsPerHour,
          accuracy,
          aiDraftsAccepted: Number(row.aiDraftsAccepted),
          aiDraftsRejected: Number(row.aiDraftsRejected),
          aiAcceptanceRate,
          improvementRate,
          ...collabMetrics,
        }
      })
    )

    // Query collaboration metrics (based on participant activity in time range, not session start)
    const collabResult = await db.execute({
      sql: `
        SELECT
          s.id as sessionId,
          s.room_id as roomId,
          s.route,
          s.submit_mode as submitMode,
          s.duration_ms as completionTime,
          s.outcome,
          COUNT(DISTINCT p.id) as participantCount,
          COUNT(DISTINCT fs.field_id) as totalFields,
          COUNT(DISTINCT ve.field_id) as validationErrors,
          GROUP_CONCAT(DISTINCT p.user_name) as participants,
          MAX(fs.focused_at) as lastActivity
        FROM telemetry_sessions s
        INNER JOIN telemetry_participants p ON s.id = p.session_id
        INNER JOIN telemetry_field_sessions fs ON s.id = fs.session_id AND fs.participant_id = p.id
        LEFT JOIN telemetry_validation_events ve ON s.id = ve.session_id
        WHERE fs.focused_at >= ?
        GROUP BY s.id
        HAVING participantCount > 1
        ORDER BY lastActivity DESC
        LIMIT 20
      `,
      args: [startTime],
    })
    const collabRows = collabResult.rows as any[]

    const collaborations: CollaborationMetrics[] = collabRows.map((row) => {
      const participants = row.participants ? String(row.participants).split(',') : []
      const avgFieldsPerUser = Number(row.participantCount) > 0 ? Number(row.totalFields) / Number(row.participantCount) : 0

      return {
        sessionId: String(row.sessionId),
        roomId: String(row.roomId),
        route: String(row.route),
        participants,
        participantCount: Number(row.participantCount),
        submitMode: String(row.submitMode),
        totalFields: Number(row.totalFields),
        avgFieldsPerUser,
        completionTime: Number(row.completionTime) || 0,
        validationErrors: Number(row.validationErrors),
        outcome: String(row.outcome || 'in progress'),
      }
    })

    // Query field preferences (fields most commonly filled during collaboration)
    const fieldResult = await db.execute({
      sql: `
        SELECT
          fs.field_id as fieldId,
          MAX(fs.field_label) as fieldLabel,
          COUNT(*) as totalCompletions,
          AVG(fs.duration_ms) / 1000.0 as avgCompletionTime
        FROM telemetry_field_sessions fs
        JOIN telemetry_sessions s ON fs.session_id = s.id
        WHERE fs.focused_at >= ? AND s.total_participants > 1 AND fs.was_completed = 1
        GROUP BY fs.field_id
        ORDER BY totalCompletions DESC
        LIMIT 20
      `,
      args: [startTime],
    })
    const fieldRows = fieldResult.rows as any[]

    const fieldPreferences: FieldPreference[] = fieldRows.map((row, idx) => ({
      fieldId: String(row.fieldId),
      fieldLabel: String(row.fieldLabel || row.fieldId),
      totalCompletions: Number(row.totalCompletions),
      avgCompletionTime: Number(row.avgCompletionTime) || 0,
      popularityRank: idx + 1,
    }))

    // Query time series data for learning curves
    const timeSeriesResult = await db.execute({
      sql: `
        SELECT
          p.user_id as userId,
          DATE(p.joined_at / 1000, 'unixepoch') as date,
          COUNT(DISTINCT fs.field_id) as fieldsCompleted,
          SUM(fs.had_validation_error) as validationErrors,
          SUM(fs.ai_draft_accepted) as aiAccepted,
          COUNT(*) as totalInteractions
        FROM telemetry_participants p
        LEFT JOIN telemetry_field_sessions fs ON p.id = fs.participant_id
        WHERE p.joined_at >= ?
        GROUP BY p.user_id, date
        ORDER BY date ASC
      `,
      args: [startTime],
    })
    const timeSeriesRows = timeSeriesResult.rows as any[]

    const timeSeriesData: TimeSeriesPoint[] = timeSeriesRows.map((row) => ({
      date: String(row.date),
      userId: String(row.userId),
      fieldsCompleted: Number(row.fieldsCompleted),
      validationErrors: Number(row.validationErrors),
      aiAcceptance: Number(row.totalInteractions) > 0 ? (Number(row.aiAccepted) / Number(row.totalInteractions)) * 100 : 0,
    }))

    const result = {
      users,
      collaborations,
      fieldPreferences,
      timeSeriesData,
    } as AnalyticsData

    return result
    } catch (error) {
      console.error('[Analytics] Error:', error)
      throw new Error('Failed to fetch analytics data')
    }
  })

/**
 * Get collaborative editing metrics for a user
 */
async function getCollaborativeMetrics(
  db: ReturnType<typeof createClient>,
  userId: string,
  startTime: number
): Promise<{
  fieldsExtended: number
  fieldsReplaced: number
  errorsFixed: number
  errorsIntroduced: number
  collaborativeScore: number
}> {
  const result = await db.execute({
    sql: `
      SELECT
        SUM(CASE WHEN action_type = 'extend' THEN 1 ELSE 0 END) as fieldsExtended,
        SUM(CASE WHEN action_type = 'replace' THEN 1 ELSE 0 END) as fieldsReplaced,
        SUM(CASE WHEN fixed_validation_error = 1 THEN 1 ELSE 0 END) as errorsFixed,
        SUM(CASE WHEN introduced_validation_error = 1 THEN 1 ELSE 0 END) as errorsIntroduced
      FROM telemetry_action_sequences
      WHERE user_id = ? AND timestamp >= ?
    `,
    args: [userId, startTime],
  })

  const row = result.rows[0] as any
  if (!row) {
    return {
      fieldsExtended: 0,
      fieldsReplaced: 0,
      errorsFixed: 0,
      errorsIntroduced: 0,
      collaborativeScore: 0,
    }
  }

  const fieldsExtended = Number(row.fieldsExtended) || 0
  const fieldsReplaced = Number(row.fieldsReplaced) || 0
  const errorsFixed = Number(row.errorsFixed) || 0
  const errorsIntroduced = Number(row.errorsIntroduced) || 0

  // Calculate collaborative score: positive for helping (extending, fixing), negative for errors
  const collaborativeScore = (fieldsExtended * 2) + (errorsFixed * 5) - (errorsIntroduced * 3)

  return {
    fieldsExtended,
    fieldsReplaced,
    errorsFixed,
    errorsIntroduced,
    collaborativeScore,
  }
}

/**
 * Calculate improvement rate by comparing first half vs second half of sessions
 */
async function calculateImprovementRate(
  db: ReturnType<typeof createClient>,
  userId: string,
  startTime: number
): Promise<number> {
  const result = await db.execute({
    sql: `
      SELECT
        p.joined_at,
        AVG(a.duration_ms) as avgDuration,
        COUNT(CASE WHEN a.had_validation_error = 1 OR a.introduced_validation_error = 1 THEN 1 END) as errors,
        COUNT(*) as fields
      FROM telemetry_participants p
      LEFT JOIN telemetry_action_sequences a ON p.id = a.participant_id
      WHERE p.user_id = ? AND p.joined_at >= ?
      GROUP BY p.session_id
      ORDER BY p.joined_at ASC
    `,
    args: [userId, startTime],
  })
  const sessions = result.rows as any[]

  if (sessions.length < 2) return 0

  const midpoint = Math.floor(sessions.length / 2)
  const firstHalf = sessions.slice(0, midpoint)
  const secondHalf = sessions.slice(midpoint)

  const firstHalfAvgSpeed = firstHalf.reduce((sum, s) => sum + (Number(s.avgDuration) || 0), 0) / firstHalf.length
  const secondHalfAvgSpeed = secondHalf.reduce((sum, s) => sum + (Number(s.avgDuration) || 0), 0) / secondHalf.length

  if (firstHalfAvgSpeed === 0) return 0

  // Negative improvement rate means user got faster (less time per field)
  const improvement = ((firstHalfAvgSpeed - secondHalfAvgSpeed) / firstHalfAvgSpeed) * 100
  return improvement
}

/**
 * Get detailed collaborative edit history for drill-down analytics
 */
export const getCollaborativeEditDetails = createServerFn({ method: 'GET' })
  .inputValidator((data: { userId?: string; sessionId?: string; fieldId?: string; timeRange?: string }) => {
    return {
      userId: data.userId,
      sessionId: data.sessionId,
      fieldId: data.fieldId,
      timeRange: (data.timeRange && ['1h', '24h', '7d', '30d'].includes(data.timeRange)) 
        ? data.timeRange as '1h' | '24h' | '7d' | '30d'
        : '24h',
    }
  })
  .handler(async ({ data }) => {
    const dbPath = path.join(process.cwd(), 'data', 'telemetry.db')
    const db = createClient({
      url: `file:${dbPath}`,
    })

    try {
      // Calculate time range
      const now = Date.now()
      const timeRangeMs = {
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
      }[data.timeRange]
      const startTimeMs = now - timeRangeMs
      const startTime = Math.floor(startTimeMs / 1000)

      // Build WHERE clause based on filters
      const conditions: string[] = ['a.timestamp >= ?']
      const args: any[] = [startTime]

      if (data.userId) {
        conditions.push('a.user_id = ?')
        args.push(data.userId)
      }

      if (data.sessionId) {
        conditions.push('a.session_id = ?')
        args.push(data.sessionId)
      }

      if (data.fieldId) {
        conditions.push('a.field_id = ?')
        args.push(data.fieldId)
      }

      const whereClause = conditions.join(' AND ')

      // Query action sequences with details including session metadata
      const result = await db.execute({
        sql: `
          SELECT
            a.id,
            a.session_id as sessionId,
            a.field_id as fieldId,
            a.timestamp,
            a.user_id as userId,
            a.user_name as userName,
            a.value_before as valueBefore,
            a.value_after as valueAfter,
            a.action_type as actionType,
            a.previous_user_id as previousUserId,
            a.previous_user_name as previousUserName,
            a.had_validation_error as hadValidationError,
            a.fixed_validation_error as fixedValidationError,
            a.introduced_validation_error as introducedValidationError,
            a.value_change_percent as valueChangePercent,
            a.duration_ms as durationMs,
            a.keystroke_count as keystrokeCount,
            s.route,
            s.submit_mode as submitMode,
            s.outcome,
            s.started_at as sessionStartedAt
          FROM telemetry_action_sequences a
          JOIN telemetry_sessions s ON a.session_id = s.id
          WHERE ${whereClause}
          ORDER BY s.started_at DESC, a.timestamp ASC
          LIMIT 100
        `,
        args,
      })

      const edits = result.rows.map((row: any) => ({
        id: Number(row.id),
        sessionId: String(row.sessionId),
        fieldId: String(row.fieldId),
        timestamp: Number(row.timestamp),
        userId: String(row.userId),
        userName: String(row.userName),
        valueBefore: String(row.valueBefore || ''),
        valueAfter: String(row.valueAfter || ''),
        actionType: String(row.actionType),
        previousUserId: row.previousUserId ? String(row.previousUserId) : null,
        previousUserName: row.previousUserName ? String(row.previousUserName) : null,
        hadValidationError: Boolean(row.hadValidationError),
        fixedValidationError: Boolean(row.fixedValidationError),
        introducedValidationError: Boolean(row.introducedValidationError),
        valueChangePercent: Number(row.valueChangePercent) || 0,
        durationMs: row.durationMs ? Number(row.durationMs) : null,
        keystrokeCount: Number(row.keystrokeCount) || 0,
        sessionStartedAt: Number(row.sessionStartedAt),
        route: String(row.route),
        submitMode: String(row.submitMode),
        outcome: row.outcome ? String(row.outcome) : null,
      }))

      return { edits }
    } catch (error) {
      console.error('[Analytics] Error fetching collaborative edit details:', error)
      throw new Error('Failed to fetch collaborative edit details')
    }
  })

/**
 * Get form submission cycles (individual form completion instances)
 */
export const getSubmissionCycles = createServerFn({ method: 'GET' })
  .inputValidator((data: { timeRange?: string }) => {
    return {
      timeRange: (data.timeRange && ['1h', '24h', '7d', '30d'].includes(data.timeRange))
        ? data.timeRange as '1h' | '24h' | '7d' | '30d'
        : '24h',
    }
  })
  .handler(async ({ data }) => {
    const options = data

    try {
      const db = getDb()

      // Calculate time filter
      const now = Date.now() / 1000
      const timeRanges = {
        '1h': now - 3600,
        '24h': now - 86400,
        '7d': now - 604800,
        '30d': now - 2592000,
      }
      const startTime = timeRanges[options.timeRange]

      console.log(`[Analytics] getSubmissionCycles: timeRange=${options.timeRange}, startTime=${startTime}, now=${now}`)

      // Query submission cycles with metrics
      const query = `
        SELECT
          sc.id,
          sc.session_id as sessionId,
          sc.started_at as startedAt,
          sc.submitted_at as submittedAt,
          sc.duration_ms as durationMs,
          sc.submitted_by as submittedBy,
          sc.submitted_by_name as submittedByName,
          sc.total_participants as totalParticipants,
          sc.total_fields as totalFields,
          sc.total_actions as totalActions,
          sc.actions_new as actionsNew,
          sc.actions_extend as actionsExtend,
          sc.actions_insert as actionsInsert,
          sc.actions_edit as actionsEdit,
          sc.actions_replace as actionsReplace,
          sc.actions_delete as actionsDelete,
          sc.actions_shorten as actionsShorten,
          sc.errors_fixed as errorsFixed,
          sc.errors_broke as errorsBroke,
          sc.accuracy,
          sc.collaboration_score as collaborationScore,
          s.room_id as roomId,
          s.route
        FROM telemetry_submission_cycles sc
        JOIN telemetry_sessions s ON sc.session_id = s.id
        WHERE sc.submitted_at IS NOT NULL
          AND sc.submitted_at >= ?
        ORDER BY sc.submitted_at DESC
        LIMIT 100
      `

      const result = await db.execute({ sql: query, args: [startTime] })
      const rows = result.rows as any[]

      console.log(`[Analytics] getSubmissionCycles: Found ${rows.length} cycles`)
      if (rows.length > 0) {
        console.log(`[Analytics] First cycle:`, rows[0])
      }

      const cycles = rows.map(row => ({
        id: String(row.id),
        sessionId: String(row.sessionId),
        roomId: String(row.roomId),
        route: String(row.route),
        startedAt: Number(row.startedAt),
        submittedAt: Number(row.submittedAt),
        durationMs: Number(row.durationMs) || 0,
        submittedBy: String(row.submittedBy),
        submittedByName: String(row.submittedByName),
        totalParticipants: Number(row.totalParticipants),
        totalFields: Number(row.totalFields),
        totalActions: Number(row.totalActions),
        actionsNew: Number(row.actionsNew),
        actionsExtend: Number(row.actionsExtend),
        actionsInsert: Number(row.actionsInsert),
        actionsEdit: Number(row.actionsEdit),
        actionsReplace: Number(row.actionsReplace),
        actionsDelete: Number(row.actionsDelete),
        actionsShorten: Number(row.actionsShorten),
        errorsFixed: Number(row.errorsFixed),
        errorsBroke: Number(row.errorsBroke),
        accuracy: Number(row.accuracy) || 0,
        collaborationScore: Number(row.collaborationScore) || 0,
      }))

      return { cycles }
    } catch (error) {
      console.error('[Analytics] Error fetching submission cycles:', error)
      throw new Error('Failed to fetch submission cycles')
    }
  })

/**
 * Get action sequences for a specific submission cycle (drill-down)
 */
export const getActionSequences = createServerFn({ method: 'GET' })
  .inputValidator((data: { cycleId: string }) => {
    if (!data.cycleId || typeof data.cycleId !== 'string') {
      throw new Error('cycleId is required')
    }
    return { cycleId: data.cycleId }
  })
  .handler(async ({ data }) => {
    const { cycleId } = data

    try {
      const db = getDb()

      // Query action sequences for this cycle
      const query = `
        SELECT
          a.id,
          a.field_id as fieldId,
          a.timestamp,
          a.completed_at as completedAt,
          a.duration_ms as durationMs,
          a.user_id as userId,
          a.user_name as userName,
          a.previous_user_id as previousUserId,
          a.previous_user_name as previousUserName,
          a.value_before as valueBefore,
          a.value_after as valueAfter,
          a.action_type as actionType,
          a.had_validation_error as hadValidationError,
          a.fixed_validation_error as fixedValidationError,
          a.introduced_validation_error as introducedValidationError,
          a.keystroke_count as keystrokeCount,
          a.value_change_percent as valueChangePercent
        FROM telemetry_action_sequences a
        WHERE a.submission_cycle_id = ?
        ORDER BY a.timestamp ASC
      `

      const result = await db.execute({ sql: query, args: [cycleId] })
      const rows = result.rows as any[]

      const actions = rows.map(row => ({
        id: Number(row.id),
        fieldId: String(row.fieldId),
        timestamp: Number(row.timestamp),
        completedAt: Number(row.completedAt),
        durationMs: Number(row.durationMs) || 0,
        userId: String(row.userId),
        userName: String(row.userName),
        previousUserId: row.previousUserId ? String(row.previousUserId) : null,
        previousUserName: row.previousUserName ? String(row.previousUserName) : null,
        valueBefore: String(row.valueBefore || ''),
        valueAfter: String(row.valueAfter || ''),
        actionType: String(row.actionType),
        hadValidationError: Boolean(row.hadValidationError),
        fixedValidationError: Boolean(row.fixedValidationError),
        introducedValidationError: Boolean(row.introducedValidationError),
        keystrokeCount: Number(row.keystrokeCount),
        valueChangePercent: Number(row.valueChangePercent) || 0,
      }))

      return { actions }
    } catch (error) {
      console.error('[Analytics] Error fetching action sequences:', error)
      throw new Error('Failed to fetch action sequences')
    }
  })
