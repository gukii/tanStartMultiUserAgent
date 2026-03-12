/**
 * Server-side analytics queries
 *
 * Queries the telemetry database to generate performance metrics
 */

import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@libsql/client'
import path from 'node:path'

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
  .inputValidator((input: unknown): { timeRange: '1h' | '24h' | '7d' | '30d' } => {
    if (!input || typeof input !== 'object' || !('timeRange' in input)) {
      return { timeRange: '24h' }
    }
    const { timeRange } = input as { timeRange: string }
    if (!['1h', '24h', '7d', '30d'].includes(timeRange)) {
      return { timeRange: '24h' }
    }
    return { timeRange: timeRange as '1h' | '24h' | '7d' | '30d' }
  })
  .handler(async (ctx): Promise<AnalyticsData> => {
    const options = ctx.data
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

      console.log('[Analytics] Query params:', {
        timeRange: options.timeRange,
        now,
        startTime,
        startTimeDate: new Date(startTime * 1000).toISOString(),
      })

    // Query user metrics
    const userResult = await db.execute({
      sql: `
        SELECT
          p.user_id as userId,
          p.user_name as userName,
          COUNT(DISTINCT p.session_id) as totalSessions,
          COUNT(DISTINCT fs.field_id) as totalFields,
          SUM(CASE WHEN fs.had_validation_error = 1 THEN 1 ELSE 0 END) as totalValidationErrors,
          SUM(CASE WHEN fs.ai_draft_accepted = 1 THEN 1 ELSE 0 END) as aiDraftsAccepted,
          SUM(CASE WHEN fs.ai_draft_offered = 1 AND fs.ai_draft_accepted = 0 THEN 1 ELSE 0 END) as aiDraftsRejected,
          AVG(fs.duration_ms) as avgDurationMs,
          COUNT(fs.id) as totalFieldSessions
        FROM telemetry_participants p
        LEFT JOIN telemetry_field_sessions fs ON p.id = fs.participant_id
        WHERE p.joined_at >= ?
        GROUP BY p.user_id, p.user_name
        HAVING totalFields > 0
        ORDER BY totalFields DESC
      `,
      args: [startTime],
    })
    const userRows = userResult.rows as any[]

    console.log('[Analytics] User query returned', userRows.length, 'rows')
    if (userRows.length > 0) {
      console.log('[Analytics] First row:', userRows[0])
    }

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

    // Query collaboration metrics
    const collabResult = await db.execute({
      sql: `
        SELECT
          s.id as sessionId,
          s.room_id as roomId,
          s.route,
          s.submit_mode as submitMode,
          s.duration_ms as completionTime,
          s.outcome,
          s.total_participants as participantCount,
          COUNT(DISTINCT fs.field_id) as totalFields,
          COUNT(DISTINCT ve.field_id) as validationErrors,
          GROUP_CONCAT(DISTINCT p.user_name) as participants
        FROM telemetry_sessions s
        LEFT JOIN telemetry_participants p ON s.id = p.session_id
        LEFT JOIN telemetry_field_sessions fs ON s.id = fs.session_id
        LEFT JOIN telemetry_validation_events ve ON s.id = ve.session_id
        WHERE s.started_at >= ? AND s.total_participants > 1
        GROUP BY s.id
        ORDER BY s.started_at DESC
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
          fs.field_label as fieldLabel,
          COUNT(*) as totalCompletions,
          AVG(fs.duration_ms) / 1000.0 as avgCompletionTime
        FROM telemetry_field_sessions fs
        JOIN telemetry_sessions s ON fs.session_id = s.id
        WHERE fs.focused_at >= ? AND s.total_participants > 1 AND fs.was_completed = 1
        GROUP BY fs.field_id, fs.field_label
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

    console.log('[Analytics] Returning data:', {
      userCount: users.length,
      collabCount: collaborations.length,
      fieldPrefCount: fieldPreferences.length,
      timeSeriesCount: timeSeriesData.length,
    })

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
        SUM(CASE WHEN edit_type = 'extend' THEN 1 ELSE 0 END) as fieldsExtended,
        SUM(CASE WHEN edit_type = 'replace' THEN 1 ELSE 0 END) as fieldsReplaced,
        SUM(CASE WHEN fixed_validation_error = 1 THEN 1 ELSE 0 END) as errorsFixed,
        SUM(CASE WHEN introduced_validation_error = 1 THEN 1 ELSE 0 END) as errorsIntroduced
      FROM telemetry_collaborative_edits
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
        AVG(fs.duration_ms) as avgDuration,
        COUNT(fs.had_validation_error) as errors,
        COUNT(*) as fields
      FROM telemetry_participants p
      LEFT JOIN telemetry_field_sessions fs ON p.id = fs.participant_id
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
