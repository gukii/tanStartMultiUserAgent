/**
 * /analytics – User performance analytics dashboard
 *
 * Displays comprehensive metrics about user form-filling behavior:
 *   • Fields filled per user
 *   • Forms completed per hour
 *   • Speed and accuracy metrics
 *   • Collaboration patterns
 *   • Learning curves for new users
 *   • AI assistance usage
 *   • Field preferences during teamwork
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { getAnalytics, getCollaborativeEditDetails, getSubmissionCycles, getActionSequences } from '../lib/analytics.server'

export const Route = createFileRoute('/analytics')({
  component: AnalyticsPage,
})

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

interface AnalyticsData {
  users: UserMetrics[]
  collaborations: CollaborationMetrics[]
  fieldPreferences: FieldPreference[]
  timeSeriesData: Array<{
    date: string
    userId: string
    fieldsCompleted: number
    validationErrors: number
    aiAcceptance: number
  }>
}

interface CollaborativeEdit {
  id: number
  sessionId: string
  fieldId: string
  timestamp: number
  userId: string
  userName: string
  valueBefore: string
  valueAfter: string
  editType: string
  previousUserId: string | null
  previousUserName: string | null
  hadValidationError: boolean
  fixedValidationError: boolean
  introducedValidationError: boolean
  valueChangePercent: number
  editDurationMs: number | null
  route: string
  submitMode: string
  outcome: string | null
  sessionStartedAt: number
}

interface SubmissionCycle {
  id: string
  sessionId: string
  roomId: string
  route: string
  startedAt: number
  submittedAt: number
  durationMs: number
  submittedBy: string
  submittedByName: string
  totalParticipants: number
  totalFields: number
  totalActions: number
  actionsNew: number
  actionsExtend: number
  actionsInsert: number
  actionsEdit: number
  actionsReplace: number
  actionsDelete: number
  actionsShorten: number
  errorsFixed: number
  errorsBroke: number
  accuracy: number
  collaborationScore: number
}

interface ActionSequence {
  id: number
  fieldId: string
  timestamp: number
  completedAt: number
  durationMs: number
  userId: string
  userName: string
  previousUserId: string | null
  previousUserName: string | null
  valueBefore: string
  valueAfter: string
  actionType: string
  hadValidationError: boolean
  fixedValidationError: boolean
  introducedValidationError: boolean
  keystrokeCount: number
  valueChangePercent: number
}

function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h')
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const [drillDownUserId, setDrillDownUserId] = useState<string | null>(null)
  const [drillDownData, setDrillDownData] = useState<CollaborativeEdit[] | null>(null)
  const [drillDownLoading, setDrillDownLoading] = useState(false)

  // Submission cycles state
  const [submissionCycles, setSubmissionCycles] = useState<SubmissionCycle[] | null>(null)
  const [cyclesLoading, setCyclesLoading] = useState(false)
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null)
  const [actionSequences, setActionSequences] = useState<ActionSequence[] | null>(null)
  const [actionsLoading, setActionsLoading] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const result = await getAnalytics({ data: { timeRange } })
        setData(result)
        setLastFetched(new Date())
        setError(null)
      } catch (err) {
        console.error('[Analytics] Fetch error:', err)
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [timeRange])

  // Fetch drill-down data when user is selected
  useEffect(() => {
    async function fetchDrillDown() {
      if (!drillDownUserId) {
        setDrillDownData(null)
        return
      }

      try {
        setDrillDownLoading(true)
        const result = await getCollaborativeEditDetails({
          data: { userId: drillDownUserId, timeRange }
        })
        setDrillDownData(result.edits)
      } catch (err) {
        console.error('[Analytics] Drill-down fetch error:', err)
      } finally {
        setDrillDownLoading(false)
      }
    }
    fetchDrillDown()
  }, [drillDownUserId, timeRange])

  // Fetch submission cycles
  useEffect(() => {
    async function fetchCycles() {
      try {
        setCyclesLoading(true)
        const result = await getSubmissionCycles({ data: { timeRange } })
        setSubmissionCycles(result.cycles)
      } catch (err) {
        console.error('[Analytics] Submission cycles fetch error:', err)
      } finally {
        setCyclesLoading(false)
      }
    }
    fetchCycles()
  }, [timeRange])

  // Fetch action sequences when cycle is selected
  useEffect(() => {
    async function fetchActions() {
      if (!selectedCycleId) {
        setActionSequences(null)
        return
      }

      try {
        setActionsLoading(true)
        const result = await getActionSequences({ data: { cycleId: selectedCycleId } })
        setActionSequences(result.actions)
      } catch (err) {
        console.error('[Analytics] Action sequences fetch error:', err)
      } finally {
        setActionsLoading(false)
      }
    }
    fetchActions()
  }, [selectedCycleId])

  const handleUserClick = (userId: string) => {
    setDrillDownUserId(userId === drillDownUserId ? null : userId)
  }

  const handleCycleClick = (cycleId: string) => {
    setSelectedCycleId(cycleId === selectedCycleId ? null : cycleId)
  }

  const getInitials = (name: string) => {
    // Return first 3 letters of name (e.g., "Robert" -> "Rob")
    return name.slice(0, 3).charAt(0).toUpperCase() + name.slice(1, 3).toLowerCase()
  }

  const truncateText = (text: string, maxLength: number = 40) => {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
  }

  // Group edits by session for compact display
  const groupEditsBySession = (edits: CollaborativeEdit[]) => {
    const sessions = new Map<string, {
      sessionId: string
      route: string
      sessionStartedAt: number
      edits: CollaborativeEdit[]
    }>()

    edits.forEach(edit => {
      if (!sessions.has(edit.sessionId)) {
        sessions.set(edit.sessionId, {
          sessionId: edit.sessionId,
          route: edit.route,
          sessionStartedAt: edit.sessionStartedAt,
          edits: []
        })
      }
      sessions.get(edit.sessionId)!.edits.push(edit)
    })

    return Array.from(sessions.values())
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-4xl">📊</div>
          <div className="text-gray-600">Loading analytics...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <div className="mb-2 text-4xl">⚠️</div>
          <h2 className="mb-2 text-lg font-semibold text-red-800">Error loading analytics</h2>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    )
  }

  if (!data || !data.users) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-md rounded-xl border border-yellow-200 bg-yellow-50 p-6 text-center">
          <div className="mb-2 text-4xl">📊</div>
          <h2 className="mb-2 text-lg font-semibold text-yellow-800">No Data Available</h2>
          <p className="text-sm text-yellow-700">
            No analytics data found. Start using the demo pages to generate telemetry data.
          </p>
        </div>
      </div>
    )
  }

  const filteredUsers = selectedUser
    ? (data.users || []).filter((u) => u.userId === selectedUser)
    : (data.users || [])

  const collaborations = data.collaborations || []
  const fieldPreferences = data.fieldPreferences || []
  const timeSeriesData = data.timeSeriesData || []

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <a href="/" className="text-sm text-violet-600 hover:underline">
            ← Back
          </a>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">
            📊 Analytics Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Form filling performance metrics and collaboration insights
          </p>
        </div>

        {/* Time Range Selector */}
        <div className="mb-6 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Time range:</span>
            {(['1h', '24h', '7d', '30d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  timeRange === range
                    ? 'bg-violet-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {range === '1h' ? 'Last Hour' : range === '24h' ? 'Last 24h' : range === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
              </button>
            ))}
          </div>
          <div className="text-xs text-gray-500">
            {loading ? (
              <span className="text-violet-600">Loading...</span>
            ) : (
              <>
                Showing {(data.users || []).length} user{(data.users || []).length !== 1 ? 's' : ''}, {collaborations.length} collaboration{collaborations.length !== 1 ? 's' : ''}
                {lastFetched && ` • Updated ${lastFetched.toLocaleTimeString()}`}
              </>
            )}
          </div>
        </div>

        {/* User Performance Overview */}
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">👥 User Performance</h2>

          {/* User Filter */}
          <div className="mb-4">
            <select
              value={selectedUser || ''}
              onChange={(e) => setSelectedUser(e.target.value || null)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">All Users</option>
              {(data.users || []).map((user) => (
                <option key={user.userId} value={user.userId}>
                  {user.userName} ({user.userId})
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-700">User</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Sessions</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Fields</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Extended</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Replaced</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Fixed</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Broke</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Accuracy</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Score</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr
                    key={user.userId}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleUserClick(user.userId)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {user.userName === user.userId ? (
                          <span className="text-gray-400 italic">Anonymous User</span>
                        ) : (
                          user.userName
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{user.userId}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.totalSessions}</td>
                    <td className="px-4 py-3 text-gray-600">{user.totalFields}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={user.fieldsExtended > 0 ? 'text-green-600 font-semibold' : 'text-gray-400'}>
                        {user.fieldsExtended}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={user.fieldsReplaced > 0 ? 'text-blue-600' : 'text-gray-400'}>
                        {user.fieldsReplaced}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={user.errorsFixed > 0 ? 'text-green-600 font-semibold' : 'text-gray-400'}>
                        {user.errorsFixed}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={user.errorsIntroduced > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>
                        {user.errorsIntroduced}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                          user.accuracy >= 95
                            ? 'bg-green-100 text-green-800'
                            : user.accuracy >= 85
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {user.accuracy.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block font-bold ${
                          user.collaborativeScore > 10
                            ? 'text-green-600'
                            : user.collaborativeScore < -5
                            ? 'text-red-600'
                            : 'text-gray-600'
                        }`}
                        title={`+2 per extend, +5 per fix, -3 per error introduced`}
                      >
                        {user.collaborativeScore > 0 ? '+' : ''}{user.collaborativeScore}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Drill-down panel for collaborative edits */}
          {drillDownUserId && (
            <div className="mt-6 border-t border-gray-200 pt-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-md font-semibold text-gray-900">
                  📝 Collaborative Edit History - {data.users.find(u => u.userId === drillDownUserId)?.userName}
                </h3>
                <button
                  onClick={() => setDrillDownUserId(null)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  ✕ Close
                </button>
              </div>

              {drillDownLoading ? (
                <div className="py-8 text-center text-gray-500">Loading edit history...</div>
              ) : drillDownData && drillDownData.length > 0 ? (
                <div className="max-h-96 overflow-y-auto">
                  {groupEditsBySession(drillDownData).map((session) => (
                    <div key={session.sessionId} className="mb-6">
                      {/* Session Header */}
                      <div className="mb-2 flex items-center gap-3 text-sm">
                        <span className="font-semibold text-gray-700">
                          {new Date(session.sessionStartedAt * 1000).toLocaleDateString()} {new Date(session.sessionStartedAt * 1000).toLocaleTimeString()}
                        </span>
                        <span className="text-gray-500">•</span>
                        <span className="text-gray-600">{session.route}</span>
                        <span className="text-gray-500">•</span>
                        <span className="text-gray-500 text-xs">{session.sessionId}</span>
                      </div>

                      {/* Edits Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border border-gray-200">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="px-2 py-1.5 text-left font-semibold text-gray-700">Time</th>
                              <th className="px-2 py-1.5 text-left font-semibold text-gray-700">Field</th>
                              <th className="px-2 py-1.5 text-left font-semibold text-gray-700">Action</th>
                              <th className="px-2 py-1.5 text-left font-semibold text-gray-700">From</th>
                              <th className="px-2 py-1.5 text-left font-semibold text-gray-700">Before</th>
                              <th className="px-2 py-1.5 text-left font-semibold text-gray-700">After</th>
                              <th className="px-2 py-1.5 text-center font-semibold text-gray-700">Δ%</th>
                              <th className="px-2 py-1.5 text-center font-semibold text-gray-700">Dur</th>
                            </tr>
                          </thead>
                          <tbody>
                            {session.edits.map((edit) => (
                              <tr
                                key={edit.id}
                                className={`border-b border-gray-100 ${
                                  edit.fixedValidationError
                                    ? 'bg-green-50'
                                    : edit.introducedValidationError
                                    ? 'bg-red-50'
                                    : 'hover:bg-gray-50'
                                }`}
                              >
                                <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">
                                  {new Date(edit.timestamp * 1000).toLocaleTimeString()}
                                </td>
                                <td className="px-2 py-1.5 text-gray-700 font-medium">
                                  {edit.fieldId}
                                </td>
                                <td className="px-2 py-1.5">
                                  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${
                                    edit.editType === 'extend'
                                      ? 'bg-blue-100 text-blue-800'
                                      : edit.editType === 'replace'
                                      ? 'bg-purple-100 text-purple-800'
                                      : 'bg-gray-100 text-gray-700'
                                  }`}>
                                    {edit.editType}
                                  </span>
                                  {edit.fixedValidationError && (
                                    <span className="ml-1 inline-block rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-800">
                                      ✓
                                    </span>
                                  )}
                                  {edit.introducedValidationError && (
                                    <span className="ml-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-800">
                                      ✗
                                    </span>
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-gray-600">
                                  {edit.previousUserName ? (
                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-xs font-semibold" title={edit.previousUserName}>
                                      {getInitials(edit.previousUserName)}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 italic">new</span>
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-gray-700 font-mono max-w-xs" title={edit.valueBefore}>
                                  {edit.valueBefore ? truncateText(edit.valueBefore, 30) : <span className="italic text-gray-400">empty</span>}
                                </td>
                                <td className="px-2 py-1.5 text-gray-700 font-mono max-w-xs" title={edit.valueAfter}>
                                  {edit.valueAfter ? truncateText(edit.valueAfter, 30) : <span className="italic text-gray-400">empty</span>}
                                </td>
                                <td className="px-2 py-1.5 text-center text-gray-600">
                                  {edit.valueChangePercent}%
                                </td>
                                <td className="px-2 py-1.5 text-center text-gray-600 whitespace-nowrap">
                                  {edit.editDurationMs ? `${(edit.editDurationMs / 1000).toFixed(1)}s` : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-gray-500">
                  No collaborative edits found for this user
                </div>
              )}
            </div>
          )}
        </div>

        {/* Collaboration Analysis */}
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">🤝 Collaboration Sessions</h2>
          <div className="space-y-4">
            {collaborations.map((collab) => (
              <div
                key={collab.sessionId}
                className="rounded-lg border border-gray-200 p-4"
              >
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{collab.route}</div>
                    <div className="text-sm text-gray-600">
                      {collab.participants.join(', ')} ({collab.participantCount} users)
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {collab.completionTime > 0 ? `${(collab.completionTime / 1000 / 60).toFixed(1)} min` : 'In progress'}
                    </div>
                    <div className="text-xs text-gray-600">{collab.submitMode} mode</div>
                  </div>
                </div>
                <div className="flex gap-4 text-sm">
                  <span className="text-gray-600">
                    Fields: <strong>{collab.totalFields}</strong>
                  </span>
                  <span className="text-gray-600">
                    Avg/user: <strong>{collab.avgFieldsPerUser.toFixed(1)}</strong>
                  </span>
                  <span className="text-gray-600">
                    Errors: <strong className={collab.validationErrors > 0 ? 'text-red-600' : ''}>{collab.validationErrors}</strong>
                  </span>
                  {collab.outcome && (
                    <span className="text-gray-600">
                      Status: <strong className="text-green-600">{collab.outcome}</strong>
                    </span>
                  )}
                </div>
              </div>
            ))}
            {collaborations.length === 0 && (
              <div className="py-8 text-center text-gray-500">
                No collaboration sessions in this time range
              </div>
            )}
          </div>
        </div>

        {/* Field Preferences */}
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">📝 Field Preferences During Teamwork</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fieldPreferences.map((field) => (
              <div
                key={field.fieldId}
                className="rounded-lg border border-gray-200 p-4"
              >
                <div className="mb-1 flex items-start justify-between">
                  <div className="font-medium text-gray-900">{field.fieldLabel}</div>
                  <div className="text-xs font-semibold text-violet-600">#{field.popularityRank}</div>
                </div>
                <div className="flex gap-3 text-sm text-gray-600">
                  <span>Completions: <strong>{field.totalCompletions}</strong></span>
                  <span>Avg: <strong>{field.avgCompletionTime.toFixed(1)}s</strong></span>
                </div>
              </div>
            ))}
            {fieldPreferences.length === 0 && (
              <div className="col-span-full py-8 text-center text-gray-500">
                No field data available
              </div>
            )}
          </div>
        </div>

        {/* Form Submission Cycles */}
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">📋 Form Submission Cycles</h2>
          <p className="mb-4 text-sm text-gray-600">
            Individual form completion instances with metrics and collaborative action history
          </p>

          {cyclesLoading ? (
            <div className="py-8 text-center text-gray-500">Loading submission cycles...</div>
          ) : submissionCycles && submissionCycles.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-gray-700">Time</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Submitted By</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Duration</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Fields</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Ext</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Ins</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Edit</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Repl</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Del</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Fix</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Brk</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Accuracy</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {submissionCycles.map((cycle) => (
                      <React.Fragment key={cycle.id}>
                        <tr
                          onClick={() => handleCycleClick(cycle.id)}
                          className="cursor-pointer hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-3 text-gray-900">
                            {new Date(cycle.submittedAt * 1000).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700">
                                {getInitials(cycle.submittedByName)}
                              </div>
                              <span className="text-gray-900">{cycle.submittedByName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {(cycle.durationMs / 1000).toFixed(1)}s
                          </td>
                          <td className="px-4 py-3 text-gray-900 font-medium">
                            {cycle.totalFields}
                          </td>
                          <td className="px-4 py-3 text-green-600 font-medium">
                            {cycle.actionsExtend}
                          </td>
                          <td className="px-4 py-3 text-teal-600 font-medium">
                            {cycle.actionsInsert}
                          </td>
                          <td className="px-4 py-3 text-orange-600 font-medium">
                            {cycle.actionsEdit}
                          </td>
                          <td className="px-4 py-3 text-blue-600 font-medium">
                            {cycle.actionsReplace}
                          </td>
                          <td className="px-4 py-3 text-red-600 font-medium">
                            {cycle.actionsDelete}
                          </td>
                          <td className="px-4 py-3 text-emerald-600 font-medium">
                            {cycle.errorsFixed}
                          </td>
                          <td className="px-4 py-3 text-red-600 font-medium">
                            {cycle.errorsBroke}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-semibold ${cycle.accuracy >= 80 ? 'text-green-600' : cycle.accuracy >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {cycle.accuracy.toFixed(0)}%
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-semibold ${cycle.collaborationScore >= 80 ? 'text-green-600' : cycle.collaborationScore >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {cycle.collaborationScore.toFixed(0)}
                            </span>
                          </td>
                        </tr>

                        {/* Drill-down: Action sequences for this cycle */}
                        {selectedCycleId === cycle.id && (
                          <tr>
                            <td colSpan={13} className="bg-gray-50 px-4 py-4">
                              {actionsLoading ? (
                                <div className="py-4 text-center text-gray-500">Loading actions...</div>
                              ) : actionSequences && actionSequences.length > 0 ? (
                                <div className="rounded-lg border border-gray-200 bg-white p-4">
                                  <h3 className="mb-3 text-sm font-semibold text-gray-900">
                                    Collaborative Action History
                                  </h3>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                      <thead className="border-b border-gray-200 bg-gray-50">
                                        <tr>
                                          <th className="px-3 py-2 font-semibold text-gray-700">Time</th>
                                          <th className="px-3 py-2 font-semibold text-gray-700">Field</th>
                                          <th className="px-3 py-2 font-semibold text-gray-700">Action</th>
                                          <th className="px-3 py-2 font-semibold text-gray-700">Before</th>
                                          <th className="px-3 py-2 font-semibold text-gray-700">After</th>
                                          <th className="px-3 py-2 font-semibold text-gray-700">Δ%</th>
                                          <th className="px-3 py-2 font-semibold text-gray-700">Duration</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {actionSequences.map((action) => (
                                          <tr key={action.id} className="hover:bg-gray-50">
                                            <td className="px-3 py-2 text-gray-600">
                                              {new Date(action.timestamp * 1000).toLocaleTimeString()}
                                            </td>
                                            <td className="px-3 py-2 text-gray-900 font-medium">
                                              {action.fieldId}
                                            </td>
                                            <td className="px-3 py-2">
                                              <div className="flex items-center gap-1">
                                                <span className="font-semibold text-violet-600">
                                                  {getInitials(action.userName)}:
                                                </span>
                                                <span className={`font-medium ${
                                                  action.actionType === 'new' ? 'text-purple-600' :
                                                  action.actionType === 'extend' ? 'text-green-600' :
                                                  action.actionType === 'insert' ? 'text-teal-600' :
                                                  action.actionType === 'edit' ? 'text-orange-600' :
                                                  action.actionType === 'replace' ? 'text-blue-600' :
                                                  action.actionType === 'delete' ? 'text-red-600' :
                                                  action.actionType === 'shorten' ? 'text-amber-600' :
                                                  'text-gray-600'
                                                }`}>
                                                  {action.actionType}
                                                </span>
                                                {action.fixedValidationError && (
                                                  <span className="text-green-600 ml-1">✓</span>
                                                )}
                                                {action.introducedValidationError && (
                                                  <span className="text-red-600 ml-1">✗</span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="px-3 py-2 text-gray-600 max-w-xs truncate" title={action.valueBefore}>
                                              {truncateText(action.valueBefore, 30)}
                                            </td>
                                            <td className="px-3 py-2 text-gray-900 max-w-xs truncate font-medium" title={action.valueAfter}>
                                              {truncateText(action.valueAfter, 30)}
                                            </td>
                                            <td className="px-3 py-2 text-gray-600">
                                              {action.valueChangePercent}%
                                            </td>
                                            <td className="px-3 py-2 text-gray-600">
                                              {(action.durationMs / 1000).toFixed(1)}s
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ) : (
                                <div className="py-4 text-center text-gray-500">No actions recorded</div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-gray-500">
              No submission cycles found. Complete and submit a form to see data here.
            </div>
          )}
        </div>

        {/* Learning Curve Visualization */}
        {selectedUser && (
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">📈 Learning Curve</h2>
            <div className="space-y-2">
              {timeSeriesData
                .filter((d) => d.userId === selectedUser)
                .map((point, idx) => (
                  <div key={idx} className="flex items-center gap-4">
                    <div className="w-32 text-sm text-gray-600">{point.date}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-gray-100">
                          <div
                            className="h-2 rounded-full bg-violet-600"
                            style={{ width: `${Math.min((point.fieldsCompleted / 50) * 100, 100)}%` }}
                          />
                        </div>
                        <div className="text-sm font-medium text-gray-900">{point.fieldsCompleted} fields</div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600">
                      {point.validationErrors} errors · {point.aiAcceptance.toFixed(0)}% AI
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
