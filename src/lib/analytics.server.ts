/**
 * Server-side analytics queries
 *
 * Queries the telemetry database to generate performance metrics
 */

import { createServerFn } from '@tanstack/start'
import Database from 'better-sqlite3'
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

export const getAnalytics = createServerFn('GET', async (options: { timeRange: '1h' | '24h' | '7d' | '30d' }) => {
  const dbPath = path.join(process.cwd(), 'data', 'telemetry.db')
  const db = new Database(dbPath, { readonly: true })

  try {
    // Calculate time range in milliseconds
    const now = Date.now()
    const timeRangeMs = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    }[options.timeRange]
    const startTime = now - timeRangeMs

    // Query user metrics
    const userRows = db.prepare(`
      SELECT
        p.user_id as userId,
        p.user_name as userName,
        COUNT(DISTINCT p.session_id) as totalSessions,
        p.total_fields_edited as totalFields,
        p.total_validation_errors as totalValidationErrors,
        p.ai_drafts_accepted as aiDraftsAccepted,
        p.ai_drafts_rejected as aiDraftsRejected,
        AVG(fs.duration_ms) as avgDurationMs,
        COUNT(fs.id) as totalFieldSessions
      FROM telemetry_participants p
      LEFT JOIN telemetry_field_sessions fs ON p.id = fs.participant_id
      WHERE p.joined_at >= ?
      GROUP BY p.user_id, p.user_name
      ORDER BY totalFields DESC
    `).all(startTime) as any[]

    const users: UserMetrics[] = userRows.map((row) => {
      const avgTimePerField = row.avgDurationMs ? row.avgDurationMs / 1000 : 0
      const avgFieldsPerSession = row.totalSessions > 0 ? row.totalFields / row.totalSessions : 0
      const estimatedTimeForFullForm = avgTimePerField * 10 // Assume 10 fields per form
      const formsPerHour = avgTimePerField > 0 ? 3600 / estimatedTimeForFullForm : 0
      const accuracy = row.totalFields > 0
        ? ((row.totalFields - row.totalValidationErrors) / row.totalFields) * 100
        : 100
      const totalAiInteractions = row.aiDraftsAccepted + row.aiDraftsRejected
      const aiAcceptanceRate = totalAiInteractions > 0
        ? (row.aiDraftsAccepted / totalAiInteractions) * 100
        : 0

      // Calculate improvement rate (simplified - compare first half vs second half of sessions)
      const improvementRate = calculateImprovementRate(db, row.userId, startTime)

      return {
        userId: row.userId,
        userName: row.userName,
        totalSessions: row.totalSessions,
        totalFields: row.totalFields,
        totalValidationErrors: row.totalValidationErrors,
        avgFieldsPerSession,
        avgTimePerField,
        estimatedTimeForFullForm,
        formsPerHour,
        accuracy,
        aiDraftsAccepted: row.aiDraftsAccepted,
        aiDraftsRejected: row.aiDraftsRejected,
        aiAcceptanceRate,
        improvementRate,
      }
    })

    // Query collaboration metrics
    const collabRows = db.prepare(`
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
    `).all(startTime) as any[]

    const collaborations: CollaborationMetrics[] = collabRows.map((row) => {
      const participants = row.participants ? row.participants.split(',') : []
      const avgFieldsPerUser = row.participantCount > 0 ? row.totalFields / row.participantCount : 0

      return {
        sessionId: row.sessionId,
        roomId: row.roomId,
        route: row.route,
        participants,
        participantCount: row.participantCount,
        submitMode: row.submitMode,
        totalFields: row.totalFields,
        avgFieldsPerUser,
        completionTime: row.completionTime || 0,
        validationErrors: row.validationErrors,
        outcome: row.outcome || 'in progress',
      }
    })

    // Query field preferences (fields most commonly filled during collaboration)
    const fieldRows = db.prepare(`
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
    `).all(startTime) as any[]

    const fieldPreferences: FieldPreference[] = fieldRows.map((row, idx) => ({
      fieldId: row.fieldId,
      fieldLabel: row.fieldLabel || row.fieldId,
      totalCompletions: row.totalCompletions,
      avgCompletionTime: row.avgCompletionTime || 0,
      popularityRank: idx + 1,
    }))

    // Query time series data for learning curves
    const timeSeriesRows = db.prepare(`
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
    `).all(startTime) as any[]

    const timeSeriesData: TimeSeriesPoint[] = timeSeriesRows.map((row) => ({
      date: row.date,
      userId: row.userId,
      fieldsCompleted: row.fieldsCompleted,
      validationErrors: row.validationErrors,
      aiAcceptance: row.totalInteractions > 0 ? (row.aiAccepted / row.totalInteractions) * 100 : 0,
    }))

    return {
      users,
      collaborations,
      fieldPreferences,
      timeSeriesData,
    } as AnalyticsData
  } finally {
    db.close()
  }
})

/**
 * Calculate improvement rate by comparing first half vs second half of sessions
 */
function calculateImprovementRate(db: Database.Database, userId: string, startTime: number): number {
  const sessions = db.prepare(`
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
  `).all(userId, startTime) as any[]

  if (sessions.length < 2) return 0

  const midpoint = Math.floor(sessions.length / 2)
  const firstHalf = sessions.slice(0, midpoint)
  const secondHalf = sessions.slice(midpoint)

  const firstHalfAvgSpeed = firstHalf.reduce((sum, s) => sum + (s.avgDuration || 0), 0) / firstHalf.length
  const secondHalfAvgSpeed = secondHalf.reduce((sum, s) => sum + (s.avgDuration || 0), 0) / secondHalf.length

  if (firstHalfAvgSpeed === 0) return 0

  // Negative improvement rate means user got faster (less time per field)
  const improvement = ((firstHalfAvgSpeed - secondHalfAvgSpeed) / firstHalfAvgSpeed) * 100
  return improvement
}
