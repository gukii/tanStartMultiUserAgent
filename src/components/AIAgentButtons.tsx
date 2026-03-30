/**
 * AIAgentButtons
 *
 * Universal AI agent control buttons that appear below any form.
 * Only visible when VITE_ENABLE_AI_AGENT is enabled.
 *
 * Features:
 * - Fill Empty Fields: Fills only empty form fields
 * - Complete Fields: Validates and completes all fields (future: fix errors)
 */

import { useState } from 'react'
import type { FieldSchema } from '../types/collaboration'

interface AIAgentButtonsProps {
  roomId: string
  pageSchema: FieldSchema[]
  fieldValues: Record<string, string>
  disabled?: boolean
}

export function AIAgentButtons({
  roomId,
  pageSchema,
  fieldValues,
  disabled,
}: AIAgentButtonsProps) {
  const [status, setStatus] = useState<string>('')
  const [loading, setLoading] = useState(false)

  console.log('[AIAgentButtons] Rendering with:', { roomId, fieldCount: pageSchema.length, disabled })

  async function fillFields(mode: 'fill-empty' | 'complete') {
    setLoading(true)
    setStatus(`${mode === 'fill-empty' ? 'Filling empty fields' : 'Completing fields'}...`)

    try {
      // Call API to get suggestions
      const response = await fetch('/api/ai-suggest-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: pageSchema,
          currentValues: fieldValues,
          mode,
        }),
      })

      if (!response.ok) {
        throw new Error('API request failed')
      }

      const data = await response.json()
      const suggestions = data.suggestions || []

      if (suggestions.length === 0) {
        setStatus('No fields to fill')
        setLoading(false)
        return
      }

      // Connect as AI Agent peer via WebSocket
      const host = window.location.host
      const wsProto = host.startsWith('localhost') || host.startsWith('127.')
        ? 'ws'
        : 'wss'
      const url = `${wsProto}://${host}/parties/main/${encodeURIComponent(roomId)}?userId=ai-agent&name=AI%20Agent&color=%238b5cf6`
      const ws = new WebSocket(url)

      ws.onopen = () => {
        // Send UPDATE_FIELD for each suggestion
        suggestions.forEach((suggestion: any) => {
          ws.send(JSON.stringify({
            type: 'UPDATE_FIELD',
            fieldId: suggestion.fieldId,
            value: suggestion.value,
            timestamp: Date.now(),
          }))
        })

        // Close connection after sending
        setTimeout(() => {
          ws.close()
          setStatus(`✓ ${suggestions.length} field${suggestions.length > 1 ? 's' : ''} filled`)
          setLoading(false)
        }, 500)
      }

      ws.onerror = () => {
        setStatus('WebSocket error – is server running?')
        setLoading(false)
      }
    } catch (error) {
      console.error('[AI Agent] Error:', error)
      setStatus('Error: Could not fill fields')
      setLoading(false)
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-violet-300 bg-violet-50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-lg">🤖</span>
        <h3 className="text-sm font-semibold text-violet-900">AI Agent</h3>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          onClick={() => fillFields('fill-empty')}
          disabled={loading}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Fill Empty Fields
        </button>

        <button
          onClick={() => fillFields('complete')}
          disabled={loading}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Complete Fields
        </button>
      </div>

      {status && (
        <p className="text-xs text-violet-700">
          {status}
        </p>
      )}
    </div>
  )
}
