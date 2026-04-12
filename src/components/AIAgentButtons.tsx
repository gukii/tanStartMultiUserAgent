/**
 * AIAgentButtons
 *
 * Universal AI agent control buttons that appear below any form.
 * Only visible when VITE_ENABLE_AI_AGENT is enabled.
 *
 * Features:
 * - Fill Empty Fields: Fills only empty/unchecked fields, leaves filled fields intact
 * - Complete Fields: Validates and fixes invalid/incomplete fields (e.g., CVV with 2 digits), leaves valid fields intact
 */

import { useState, useEffect, useRef } from 'react'
import type { FieldSchema } from '../types/collaboration'
import type { FormContextStatus } from '../routes/api/form-context-status'

interface AIAgentButtonsProps {
  roomId: string
  pageSchema: FieldSchema[]
  fieldValues: Record<string, string>
  disabled?: boolean
  containerRef?: React.RefObject<HTMLElement | null>
}

export function AIAgentButtons({
  roomId,
  pageSchema,
  fieldValues,
  disabled,
  containerRef,
}: AIAgentButtonsProps) {
  const [status, setStatus] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [contextStatus, setContextStatus] = useState<FormContextStatus | null>(null)
  const [showContextDetail, setShowContextDetail] = useState(false)
  const [copied, setCopied] = useState(false)

  // Fetch form context status once on mount
  useEffect(() => {
    fetch('/api/form-context-status')
      .then(r => r.json())
      .then((data: FormContextStatus) => setContextStatus(data))
      .catch(() => {})
  }, [])

  // Listen for floating ✨ button events
  // Scoped querySelector – prefers the harness container, falls back to document
  function scopedQuery(selector: string): HTMLElement | null {
    const root = containerRef?.current ?? document
    return root.querySelector(selector) as HTMLElement | null
  }

  function scopedQueryAll(selector: string): NodeListOf<HTMLElement> {
    const root = containerRef?.current ?? document
    return root.querySelectorAll(selector) as NodeListOf<HTMLElement>
  }

  // Use refs to avoid re-attaching listeners when pageSchema/roomId change
  const pageSchemaRef = useRef(pageSchema)
  const roomIdRef = useRef(roomId)

  useEffect(() => {
    pageSchemaRef.current = pageSchema
    roomIdRef.current = roomId
  }, [pageSchema, roomId])

  useEffect(() => {
    function handleFillAll() {
      // Use ref to get latest pageSchema/roomId without re-attaching listeners
      fillFieldsWithParams('fill-empty', pageSchemaRef.current, roomIdRef.current)
    }

    function handleFieldSelected(e: Event) {
      const customEvent = e as CustomEvent<{ fieldName: string; elementIndex?: number }>
      const fieldName = customEvent.detail?.fieldName
      const elementIndex = customEvent.detail?.elementIndex
      console.log('[AIAgentButtons] Received ai-help-field-selected event:', fieldName, 'index:', elementIndex)
      if (fieldName !== undefined || elementIndex !== undefined) {
        fillSingleFieldWithParams(fieldName ?? '', pageSchemaRef.current, roomIdRef.current, elementIndex)
      }
    }

    window.addEventListener('ai-help-fill-all', handleFillAll)
    window.addEventListener('ai-help-field-selected', handleFieldSelected as EventListener)

    return () => {
      window.removeEventListener('ai-help-fill-all', handleFillAll)
      window.removeEventListener('ai-help-field-selected', handleFieldSelected as EventListener)
    }
  }, []) // Only set up once on mount

  async function fillSingleFieldWithParams(fieldName: string, schema: FieldSchema[], room: string, elementIndex?: number) {
    setLoading(true)
    setStatus(`Getting AI suggestions...`)

    console.log('[AIAgentButtons] fillSingleField called:', fieldName, 'elementIndex:', elementIndex)

    try {
      // Find the field that was clicked – prefer elementIndex for unnamed fields
      const clickedField = elementIndex !== undefined
        ? schema.find(f => f.elementIndex === elementIndex)
        : schema.find(f => f.id === fieldName || f.name === fieldName)
      if (!clickedField) {
        console.error('[AIAgentButtons] Field not found in schema:', fieldName)
        setStatus('Error: Field not found')
        setLoading(false)
        return
      }

      console.log('[AIAgentButtons] Clicked field type:', clickedField.type)

      // If it's a checkbox, find ALL checkboxes in the form to evaluate them together
      let fieldsToEvaluate: FieldSchema[]
      if (clickedField.type === 'checkbox') {
        fieldsToEvaluate = schema.filter(f => f.type === 'checkbox')
        console.log('[AIAgentButtons] Found', fieldsToEvaluate.length, 'checkboxes to evaluate')
      } else {
        // For non-checkboxes, just evaluate the single field
        fieldsToEvaluate = [clickedField]
      }

      // Get current values for all fields to evaluate
      const currentValues: Record<string, string> = {}
      fieldsToEvaluate.forEach(field => {
        // Prefer lookup by data-collab-field-index for unnamed fields
        const element = (
          scopedQuery(`[data-collab-field-index="${field.elementIndex}"]`) ??
          scopedQuery(`[name="${field.id}"]`)
        ) as HTMLInputElement | null
        if (element) {
          if (element.type === 'checkbox') {
            currentValues[field.id] = element.checked ? 'on' : ''
          } else if (element.type === 'radio') {
            const checkedRadio = scopedQuery(`[name="${field.id}"]:checked`) as HTMLInputElement | null
            currentValues[field.id] = checkedRadio?.value || ''
          } else {
            currentValues[field.id] = element.value || ''
          }
        }
      })

      // Call API with all fields to evaluate
      const response = await fetch('/api/ai-suggest-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: fieldsToEvaluate,
          currentValues,
          mode: 'single-field',
          route: window.location.pathname,
        }),
      })

      if (!response.ok) {
        throw new Error('API request failed')
      }

      const data = await response.json()
      const suggestions = data.suggestions || []

      if (suggestions.length === 0) {
        setStatus('No suggestions available')
        setLoading(false)
        return
      }

      // Apply all suggestions to the DOM
      const host = window.location.host
      const wsProto = host.startsWith('localhost') || host.startsWith('127.') ? 'ws' : 'wss'
      const url = `${wsProto}://${host}/parties/main/${encodeURIComponent(room)}?userId=ai-agent&name=AI%20Agent&color=%238b5cf6`
      const ws = new WebSocket(url)

      ws.onopen = () => {
        suggestions.forEach((suggestion: any) => {
          // Look up by elementIndex first, fall back to name
          const schemaField = schema.find(f => f.id === suggestion.fieldId)
          const element = (
            schemaField ? scopedQuery(`[data-collab-field-index="${schemaField.elementIndex}"]`) : null
          ) ?? scopedQuery(`[name="${suggestion.fieldId}"]`) as HTMLInputElement | null

          if (element) {
            const inputEl = element as HTMLInputElement
            if (inputEl.type === 'checkbox') {
              inputEl.checked = suggestion.value === 'on'
            } else if (inputEl.type === 'radio') {
              const radioButton = scopedQuery(`[name="${suggestion.fieldId}"][value="${suggestion.value}"]`) as HTMLInputElement | null
              if (radioButton) {
                radioButton.checked = true
              }
            } else {
              (element as HTMLInputElement).value = suggestion.value
            }

            // Trigger change event so React/other listeners know
            element.dispatchEvent(new Event('input', { bubbles: true }))
            element.dispatchEvent(new Event('change', { bubbles: true }))
          }

          // Send via WebSocket so other peers see it
          ws.send(JSON.stringify({
            type: 'UPDATE_FIELD',
            fieldId: suggestion.fieldId,
            value: suggestion.value,
            timestamp: Date.now(),
          }))
        })

        setTimeout(() => ws.close(), 300)
      }

      const checkedCount = suggestions.filter((s: any) => s.value === 'on').length
      setStatus(`✓ ${checkedCount} checkbox${checkedCount !== 1 ? 'es' : ''} checked`)
      setTimeout(() => setStatus(''), 3000)
      setLoading(false)
    } catch (error) {
      console.error('[AIAgentButtons] Error:', error)
      setStatus('Error: Could not fill field')
      setLoading(false)
    }
  }

  // Wrapper for fillSingleField that uses current pageSchema/roomId
  async function fillSingleField(fieldName: string) {
    return fillSingleFieldWithParams(fieldName, pageSchema, roomId)
  }

  async function fillFieldsWithParams(mode: 'fill-empty' | 'complete', schema: FieldSchema[], room: string) {
    setLoading(true)
    setStatus(`${mode === 'fill-empty' ? 'Filling empty fields' : 'Validating and fixing errors'}...`)

    console.log('[AIAgentButtons] fillFields called:', {
      mode,
      fieldCount: schema.length,
      fields: schema.map(f => ({ id: f.id, type: f.type, label: f.label }))
    })

    try {
      // Read current values directly from DOM (not from stale fieldValues prop)
      // Note: field.id in schema is actually the field's "name" attribute (canonical identifier)
      const liveFieldValues: Record<string, string> = {}

      schema.forEach((field, index) => {
        const element = (
          scopedQuery(`[data-collab-field-index="${field.elementIndex}"]`) ??
          scopedQuery(`[name="${field.id}"]`)
        ) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null

        if (!element) return

        // For checkboxes and radio buttons, handle specially
        if (element.type === 'checkbox') {
          liveFieldValues[field.id] = (element as HTMLInputElement).checked ? 'on' : ''
        } else if (element.type === 'radio') {
          const checkedRadio = scopedQuery(`[name="${field.id}"]:checked`) as HTMLInputElement | null
          liveFieldValues[field.id] = checkedRadio?.value || ''
        } else {
          liveFieldValues[field.id] = element.value || ''
        }
      })

      // Filter out fields that weren't found in DOM (buttons with auto-generated names)
      // Also deduplicate radio buttons (keep only one entry per group)
      const validFields: FieldSchema[] = []
      const radioGroups = new Set<string>()

      schema.forEach(field => {
        // Skip fields not in liveFieldValues (not found in DOM)
        if (!(field.id in liveFieldValues)) {
          return
        }

        // For radio buttons, only include the first one per group
        if (field.type === 'radio') {
          if (radioGroups.has(field.id)) {
            return // Already have this radio group
          }
          radioGroups.add(field.id)
        }

        validFields.push(field)
      })

      const response = await fetch('/api/ai-suggest-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: validFields,
          currentValues: liveFieldValues,
          mode,
          route: window.location.pathname,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[AIAgentButtons] API error:', errorText)
        throw new Error('API request failed')
      }

      const data = await response.json()
      const suggestions = data.suggestions || []

      if (suggestions.length === 0) {
        setStatus('No fields to fill')

        // Dispatch completion event for floating chat status
        const completeEvent = new CustomEvent('ai-help-fill-all-complete', {
          detail: { count: 0 }
        })
        window.dispatchEvent(completeEvent)

        setLoading(false)
        return
      }

      // Connect as AI Agent peer via WebSocket
      const host = window.location.host
      const wsProto = host.startsWith('localhost') || host.startsWith('127.')
        ? 'ws'
        : 'wss'
      const url = `${wsProto}://${host}/parties/main/${encodeURIComponent(room)}?userId=ai-agent&name=AI%20Agent&color=%238b5cf6`
      const ws = new WebSocket(url)

      ws.onopen = () => {
        suggestions.forEach((suggestion: any, index: number) => {
          const schemaField = schema.find(f => f.id === suggestion.fieldId)
          const element = (
            schemaField ? scopedQuery(`[data-collab-field-index="${schemaField.elementIndex}"]`) : null
          ) ?? scopedQuery(`[name="${suggestion.fieldId}"]`) as HTMLInputElement | null

          if (element) {
            const inputEl = element as HTMLInputElement
            if (inputEl.type === 'checkbox') {
              inputEl.checked = suggestion.value === 'on'
            } else if (inputEl.type === 'radio') {
              const radioButton = scopedQuery(`[name="${suggestion.fieldId}"][value="${suggestion.value}"]`) as HTMLInputElement | null
              if (radioButton) radioButton.checked = true
            } else {
              (element as HTMLInputElement).value = suggestion.value
            }
            element.dispatchEvent(new Event('input', { bubbles: true }))
            element.dispatchEvent(new Event('change', { bubbles: true }))
          }

          ws.send(JSON.stringify({
            type: 'UPDATE_FIELD',
            fieldId: suggestion.fieldId,
            value: suggestion.value,
            timestamp: Date.now(),
          }))
        })

        setTimeout(() => {
          ws.close()
          const verb = mode === 'fill-empty' ? 'filled' : 'fixed'
          setStatus(`✓ ${suggestions.length} field${suggestions.length > 1 ? 's' : ''} ${verb}`)

          // Dispatch completion event for floating chat status
          const completeEvent = new CustomEvent('ai-help-fill-all-complete', {
            detail: { count: suggestions.length }
          })
          window.dispatchEvent(completeEvent)

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

      // Dispatch error completion event
      const completeEvent = new CustomEvent('ai-help-fill-all-complete', {
        detail: { count: 0 }
      })
      window.dispatchEvent(completeEvent)

      setLoading(false)
    }
  }

  // Wrapper for fillFields that uses current pageSchema/roomId
  async function fillFields(mode: 'fill-empty' | 'complete') {
    return fillFieldsWithParams(mode, pageSchema, roomId)
  }

  // Derive current route for the analyze command
  const currentRoute = typeof window !== 'undefined' ? window.location.pathname : ''

  // Determine context banner variant
  const contextBanner = (() => {
    if (!contextStatus) return null
    if (!contextStatus.exists) {
      return { kind: 'missing' as const }
    }
    if (contextStatus.ageDays !== null && contextStatus.ageDays > 7) {
      return { kind: 'stale' as const, ageDays: contextStatus.ageDays }
    }
    // Check if current route is covered
    const covered = Object.keys(contextStatus.routes).some(r =>
      currentRoute === r || currentRoute.startsWith(r + '/')
    )
    return {
      kind: 'ok' as const,
      fieldCount: contextStatus.fieldCount,
      routeCount: contextStatus.routeCount,
      covered,
    }
  })()

  // Copy the analyze command to clipboard
  function copyCommand() {
    const cmd = currentRoute
      ? `pnpm analyze-forms --route=${currentRoute}`
      : 'pnpm analyze-forms'
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Current route's context data (for review panel)
  const routeContext = contextStatus?.routes[currentRoute]
    ?? Object.entries(contextStatus?.routes ?? {}).find(([r]) =>
        currentRoute.startsWith(r + '/') || currentRoute === r
      )?.[1]

  return (
    <div className="mt-4 rounded-lg border border-dashed border-violet-300 bg-violet-50 p-4">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-lg">🤖</span>
        <h3 className="text-sm font-semibold text-violet-900">AI Agent</h3>
      </div>

      {/* Form context status banner */}
      {contextBanner?.kind === 'missing' && (
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-medium">⚠️ Form analysis not run</p>
          <p className="mt-0.5 text-amber-700">
            AI fill uses generic data. Run analysis for smarter, context-aware suggestions.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
              {currentRoute ? `pnpm analyze-forms --route=${currentRoute}` : 'pnpm analyze-forms'}
            </code>
            <button
              onClick={copyCommand}
              className="rounded bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-300 transition"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {contextBanner?.kind === 'stale' && (
        <div className="mb-3 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          <p className="font-medium">⏱ Form analysis is {contextBanner.ageDays} days old</p>
          <p className="mt-0.5 text-yellow-700">Consider re-running to reflect form changes.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="rounded bg-yellow-100 px-1.5 py-0.5 font-mono text-xs">
              {currentRoute ? `pnpm analyze-forms --route=${currentRoute}` : 'pnpm analyze-forms'}
            </code>
            <button
              onClick={copyCommand}
              className="rounded bg-yellow-200 px-2 py-0.5 text-xs font-medium text-yellow-900 hover:bg-yellow-300 transition"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {contextBanner?.kind === 'ok' && (
        <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
          <div className="flex items-center justify-between gap-2">
            <span>
              ✓ Form context loaded ·{' '}
              {contextBanner.routeCount} route{contextBanner.routeCount !== 1 ? 's' : ''},{' '}
              {contextBanner.fieldCount} field{contextBanner.fieldCount !== 1 ? 's' : ''}
              {!contextBanner.covered && (
                <span className="ml-1 text-yellow-700">· current route not analyzed</span>
              )}
            </span>
            {routeContext && (
              <button
                onClick={() => setShowContextDetail(v => !v)}
                className="shrink-0 rounded bg-green-100 px-2 py-0.5 font-medium text-green-800 hover:bg-green-200 transition"
              >
                {showContextDetail ? 'Hide' : 'Review'}
              </button>
            )}
          </div>

          {/* Review panel */}
          {showContextDetail && routeContext && (
            <div className="mt-2 max-h-56 overflow-y-auto rounded border border-green-200 bg-white p-2">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-green-100">
                    <th className="pb-1 pr-3 font-semibold text-gray-700">Field</th>
                    <th className="pb-1 pr-3 font-semibold text-gray-700">Intent</th>
                    <th className="pb-1 font-semibold text-gray-700">Example values</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(routeContext.fields).map(([fieldId, mapping]) => (
                    <tr key={fieldId} className="border-b border-green-50">
                      <td className="py-1 pr-3 font-mono text-gray-600">{fieldId}</td>
                      <td className="py-1 pr-3 text-gray-600">{mapping.intent}</td>
                      <td className="py-1 text-gray-500">{mapping.exampleValues.slice(0, 3).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          onClick={() => fillFields('fill-empty')}
          disabled={loading}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Fill only empty fields, leave filled fields intact"
        >
          Fill Empty Fields
        </button>

        <button
          onClick={() => fillFields('complete')}
          disabled={loading}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Validate and fix invalid fields (e.g., CVV with 2 digits)"
        >
          Fix Errors
        </button>
      </div>

      {status && (
        <p className="text-xs text-violet-700">{status}</p>
      )}
    </div>
  )
}
