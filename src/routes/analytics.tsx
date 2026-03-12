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
import { getAnalytics } from '../lib/analytics.server'

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

function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h')
  const [selectedUser, setSelectedUser] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        console.log('[Analytics] Fetching data for timeRange:', timeRange)
        const result = await getAnalytics({ timeRange })
        console.log('[Analytics] Fetched data:', result)
        setData(result)
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
        <div className="mb-6 flex flex-wrap items-center gap-2">
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
          <span className="ml-2 text-sm text-gray-500">
            ({(data.users || []).length} user{(data.users || []).length !== 1 ? 's' : ''}, {collaborations.length} collaboration{collaborations.length !== 1 ? 's' : ''})
          </span>
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
                  <th className="px-4 py-3 font-semibold text-gray-700">Fields Filled</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Helped</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Errors</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Accuracy</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Collab Score</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.userId} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{user.userName}</div>
                      <div className="text-xs text-gray-500">{user.userId}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.totalSessions}</td>
                    <td className="px-4 py-3 text-gray-600">{user.totalFields}</td>
                    <td className="px-4 py-3">
                      <div className="text-gray-600">{user.fieldsExtended} ext / {user.errorsFixed} fix</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-600">{user.totalValidationErrors} / {user.errorsIntroduced} intr</div>
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
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block font-semibold ${
                          user.collaborativeScore > 10
                            ? 'text-green-600'
                            : user.collaborativeScore < -5
                            ? 'text-red-600'
                            : 'text-gray-600'
                        }`}
                        title={`Extended: ${user.fieldsExtended}, Replaced: ${user.fieldsReplaced}, Fixed: ${user.errorsFixed}, Introduced: ${user.errorsIntroduced}`}
                      >
                        {user.collaborativeScore > 0 ? '+' : ''}{user.collaborativeScore}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
