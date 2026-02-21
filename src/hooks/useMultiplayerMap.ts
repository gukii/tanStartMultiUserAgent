import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { FieldSchema } from '../types/collaboration'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveLabel(el: HTMLElement): string {
  // 1. <label for="id">
  if (el.id) {
    const explicit = document.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`)
    if (explicit) return explicit.textContent?.trim() ?? ''
  }
  // 2. Wrapping <label>
  const parent = el.closest('label')
  if (parent) {
    const clone = parent.cloneNode(true) as HTMLElement
    clone.querySelectorAll('input, textarea, select, button').forEach((c) => c.remove())
    return clone.textContent?.trim() ?? ''
  }
  return ''
}

function extractSchema(el: HTMLElement, index: number): FieldSchema {
  const input = el as HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement
  const tag = el.tagName.toLowerCase()

  // Prefer 'name' over 'id' since React's useId() generates instance-specific IDs
  const name = input.name || el.id || `field-${index}`
  const id = name // Use name as the canonical identifier
  const type =
    tag === 'input'
      ? (input.type || 'text')
      : tag === 'button'
        ? 'button'
        : tag === 'select'
          ? 'select'
          : tag === 'textarea'
            ? 'textarea'
            : el.isContentEditable
              ? 'contenteditable'
              : tag

  const aiIntentRaw = el.getAttribute('data-ai-intent')

  return {
    id,
    name,
    type,
    placeholder: input.placeholder ?? '',
    label: resolveLabel(el),
    ariaLabel: el.getAttribute('aria-label') ?? '',
    aiIntent: aiIntentRaw ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useMultiplayerMap
 *
 * Attaches a MutationObserver to `containerRef` and keeps an up-to-date
 * FieldSchema[] for every interactable element inside the container.
 *
 * The schema is debounced (150 ms) so rapid DOM mutations (e.g. React re-renders)
 * don't flood the WebSocket with PAGE_SCHEMA broadcasts.
 *
 * @param containerRef  - ref to the harness wrapper element
 * @param onSchemaChange - optional callback fired after each schema update
 */
export function useMultiplayerMap(
  containerRef: RefObject<HTMLElement | null>,
  onSchemaChange?: (schema: FieldSchema[]) => void,
): FieldSchema[] {
  const [pageSchema, setPageSchema] = useState<FieldSchema[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Keep callback stable without triggering re-subscription
  const onSchemaChangeRef = useRef(onSchemaChange)
  onSchemaChangeRef.current = onSchemaChange

  const scan = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const elements = container.querySelectorAll<HTMLElement>(
      'input, textarea, button, select, [contenteditable]',
    )

    const schema: FieldSchema[] = []
    elements.forEach((el, i) => schema.push(extractSchema(el, i)))

    setPageSchema(schema)
    onSchemaChangeRef.current?.(schema)
  }, [containerRef])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Initial pass
    scan()

    const observer = new MutationObserver(() => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(scan, 150)
    })

    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      // Only re-scan when attributes that affect the schema change
      attributeFilter: [
        'id',
        'name',
        'type',
        'placeholder',
        'aria-label',
        'data-ai-intent',
      ],
    })

    return () => {
      observer.disconnect()
      if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    }
  }, [containerRef, scan])

  return pageSchema
}
