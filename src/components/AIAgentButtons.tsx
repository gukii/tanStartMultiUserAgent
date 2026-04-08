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

console.log('[AIAgentButtons] Module loaded')

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
  console.log('[AIAgentButtons] Component mounted/rendered', {
    roomId,
    pageSchemaCount: pageSchema.length,
    disabled,
    fieldValuesCount: Object.keys(fieldValues).length
  })
  const [status, setStatus] = useState<string>('')
  const [loading, setLoading] = useState(false)

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
    console.log('[AIAgentButtons] Setting up event listeners (once on mount)')

    function handleFillAll() {
      console.log('[AIAgentButtons] Received ai-help-fill-all event')
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
    console.log('[AIAgentButtons] Event listeners attached')

    return () => {
      console.log('[AIAgentButtons] Cleaning up event listeners')
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

      console.log('[AIAgentButtons] Calling API for fields:', {
        count: fieldsToEvaluate.length,
        fields: fieldsToEvaluate.map(f => f.id),
        currentValues
      })

      // Call API with all fields to evaluate
      const response = await fetch('/api/ai-suggest-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: fieldsToEvaluate,
          currentValues,
          mode: 'single-field',
        }),
      })

      if (!response.ok) {
        throw new Error('API request failed')
      }

      const data = await response.json()
      const suggestions = data.suggestions || []

      console.log('[AIAgentButtons] Received suggestions:', suggestions.length, suggestions)

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
            console.log('[AIAgentButtons] Applying suggestion:', {
              fieldId: suggestion.fieldId,
              value: suggestion.value,
              type: (element as HTMLInputElement).type
            })

            const inputEl = element as HTMLInputElement
            if (inputEl.type === 'checkbox') {
              const shouldCheck = suggestion.value === 'on'
              inputEl.checked = shouldCheck
              console.log(`[AIAgentButtons] Setting ${suggestion.fieldId} checkbox to:`, shouldCheck)
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

      console.log('[AIAgentButtons] Reading DOM values for', schema.length, 'fields')

      schema.forEach((field, index) => {
        const element = (
          scopedQuery(`[data-collab-field-index="${field.elementIndex}"]`) ??
          scopedQuery(`[name="${field.id}"]`)
        ) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null

        if (!element) {
          console.log(`[AIAgentButtons] Field ${index}: ${field.id} - NOT FOUND in DOM`)
          return
        }

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

      console.log('[AIAgentButtons] Live field values from DOM:', liveFieldValues)
      console.log('[AIAgentButtons] Stale fieldValues prop (for comparison):', fieldValues)

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

      console.log('[AIAgentButtons] Valid fields after filtering:', validFields.length, '(filtered from', schema.length, ')')

      // Call API to get suggestions
      console.log('[AIAgentButtons] Calling API with:', {
        fields: validFields.length,
        currentValues: liveFieldValues,
        mode
      })

      const response = await fetch('/api/ai-suggest-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: validFields,
          currentValues: liveFieldValues,
          mode,
        }),
      })

      console.log('[AIAgentButtons] API response status:', response.status, response.statusText)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[AIAgentButtons] API error:', errorText)
        throw new Error('API request failed')
      }

      const data = await response.json()
      console.log('[AIAgentButtons] API response data:', data)
      const suggestions = data.suggestions || []

      console.log('[AIAgentButtons] Suggestions received:', suggestions.length)

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
        console.log('[AIAgentButtons] WebSocket opened, sending suggestions:', suggestions)

        // Apply changes directly to DOM AND send WebSocket messages
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

          // Send WebSocket message so other peers see the change
          const message = {
            type: 'UPDATE_FIELD',
            fieldId: suggestion.fieldId,
            value: suggestion.value,
            timestamp: Date.now(),
          }
          console.log(`[AIAgentButtons] Sending message ${index + 1}/${suggestions.length}:`, message)
          ws.send(JSON.stringify(message))
        })

        // Close connection after sending
        setTimeout(() => {
          console.log('[AIAgentButtons] Closing WebSocket connection')
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
        <p className="text-xs text-violet-700">
          {status}
        </p>
      )}
    </div>
  )
}
