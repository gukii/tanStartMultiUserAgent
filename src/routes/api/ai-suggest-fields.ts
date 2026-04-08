/**
 * API Route: /api/ai-suggest-fields
 *
 * Universal field inference and suggestion endpoint.
 *
 * Purpose: Analyzes form field schemas and generates appropriate test data
 * using pattern matching and faker. Works with any form without hard-coding.
 *
 * This is a modular feature controlled by VITE_ENABLE_AI_AGENT environment variable.
 */

import { createFileRoute } from '@tanstack/react-router'
import { faker } from '@faker-js/faker'

// Helper to create JSON responses
function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
}

interface FieldSchema {
  id: string
  name: string
  type: string
  placeholder: string
  label: string
  ariaLabel: string
  aiIntent?: string
  options?: string[]
  currentValue?: string
  required?: boolean
  pattern?: string
  min?: string
  max?: string
}

interface SuggestionRequest {
  fields: FieldSchema[]
  currentValues: Record<string, string>
  mode: 'fill-empty' | 'complete' | 'single-field'
}

interface FieldSuggestion {
  fieldId: string
  value: string
  reasoning?: string
}

interface SuggestionResponse {
  suggestions: FieldSuggestion[]
}

interface FieldMapping {
  intent: string
  description: string
  exampleValues: string[]
}

interface FormContext {
  analyzedAt: string
  routes: Record<string, {
    fields: Record<string, FieldMapping>
  }>
}

/**
 * Load form context from server/form-context.json
 * Uses dynamic imports to avoid bundling Node.js modules for browser
 */
async function loadFormContext(): Promise<FormContext | null> {
  try {
    // Dynamic import to avoid bundling fs/path for browser
    const { readFileSync } = await import('fs')
    const { join } = await import('path')

    const contextPath = join(process.cwd(), 'server', 'form-context.json')
    const content = readFileSync(contextPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    // File doesn't exist or is invalid - fall back to faker
    return null
  }
}

/**
 * Validate if a field's current value is valid
 * Returns true if valid, false if needs fixing
 */
function validateFieldValue(field: FieldSchema, value: string): boolean {
  // Empty values are invalid (need filling)
  if (!value) {
    return false
  }

  // Build clues for intent detection
  const clues = [
    field.name,
    field.id,
    field.label,
    field.placeholder,
    field.ariaLabel,
    field.aiIntent,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  // CVV validation: must be 3 or 4 digits
  if (/cvv|cvc|security.*code/.test(clues) || field.name === 'cvv') {
    return /^\d{3,4}$/.test(value)
  }

  // Credit card validation: must be 13-19 digits (with optional spaces)
  if (/card.*number|credit.*card/.test(clues)) {
    const digitsOnly = value.replace(/\s/g, '')
    return /^\d{13,19}$/.test(digitsOnly)
  }

  // Expiry validation: must be MM/YY format
  if (/expir|expiry|exp.*date/.test(clues)) {
    return /^\d{2}\/\d{2}$/.test(value)
  }

  // Email validation: basic check for @
  if (field.type === 'email' || /email|e-mail/.test(clues)) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  }

  // Phone validation: at least 10 digits
  if (field.type === 'tel' || /phone|tel|mobile/.test(clues)) {
    const digitsOnly = value.replace(/\D/g, '')
    return digitsOnly.length >= 10
  }

  // Number fields: check if it's a valid number within range
  if (field.type === 'number') {
    const num = parseFloat(value)
    if (isNaN(num)) return false
    if (field.min && num < parseFloat(field.min)) return false
    if (field.max && num > parseFloat(field.max)) return false
    return true
  }

  // Date validation
  if (field.type === 'date') {
    const date = new Date(value)
    return !isNaN(date.getTime())
  }

  // For required fields, just check it's not empty
  if (field.required) {
    return value.trim().length > 0
  }

  // Default: consider it valid if it has any content
  return true
}

/**
 * Infer field intent from all available clues
 * Supports English and Unicode patterns (Chinese, Japanese, etc.)
 */
function inferFieldIntent(field: FieldSchema): string {
  // Build clues string first (needed for pattern matching)
  // Note: aiIntent is included in clues for pattern matching, not used as direct return value
  // because it often contains descriptive text rather than known intent keys
  const clues = [
    field.name,
    field.id,
    field.label,
    field.placeholder,
    field.ariaLabel,
    field.aiIntent, // Include as additional hint for pattern matching
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  // Priority 1: Specific semantic types (check before generic types)
  // Email type is specific
  if (field.type === 'email') return 'email'
  if (field.type === 'tel') return 'phone'
  if (field.type === 'url') return 'url'
  if (field.type === 'date') return 'date'
  if (field.type === 'time') return 'time'
  if (field.type === 'password') return 'password'

  // Priority 2: Payment patterns (check before generic number type)
  // These need specific generation logic
  if (/card.*number|credit.*card|número.*tarjeta|numéro.*carte|カード番号/.test(clues)) {
    return 'creditCard'
  }
  if (/cvv|cvc|security.*code|código.*seguridad/.test(clues)) {
    return 'cvv'
  }
  if (/expir|expiry|exp.*date|vencimiento|有効期限/.test(clues)) {
    return 'cardExpiry'
  }

  // Priority 3: Generic number type (after specific patterns)
  if (field.type === 'number') return 'number'

  // Priority 4: Other pattern matching on clues

  // Name patterns (English + Unicode)
  if (/first.*name|fname|given.*name|名|prénom|nombre|nome/.test(clues)) {
    return 'firstName'
  }
  if (/last.*name|lname|surname|family.*name|姓|apellido|nom de famille|sobrenome/.test(clues)) {
    return 'lastName'
  }
  if (/full.*name|complete.*name|name/.test(clues) && !/first|last/.test(clues)) {
    return 'fullName'
  }

  // Contact patterns
  if (/email|e-mail|correo electrónico|メール|courriel/.test(clues)) {
    return 'email'
  }
  if (/phone|tel|mobile|cell|電話|téléphone|teléfono/.test(clues)) {
    return 'phone'
  }

  // Address patterns
  if (/street|address.*1|address line 1|住所|adresse|dirección/.test(clues)) {
    return 'streetAddress'
  }
  if (/address.*2|apartment|apt|suite|unit/.test(clues)) {
    return 'streetAddress2'
  }
  if (/city|town|ville|ciudad|市/.test(clues)) {
    return 'city'
  }
  if (/state|province|región|estado|州/.test(clues)) {
    return 'state'
  }
  if (/zip|postal.*code|postcode|código postal|郵便番号/.test(clues)) {
    return 'zipCode'
  }
  if (/country|país|pays|国/.test(clues)) {
    return 'country'
  }

  // Payment patterns already checked earlier (Priority 2)

  // Date patterns
  if (/birth.*date|date.*birth|birthday|fecha.*nacimiento|生年月日/.test(clues)) {
    return 'birthDate'
  }
  if (/date/.test(clues)) {
    return 'date'
  }

  // Company patterns
  if (/company|organization|organisation|empresa|会社/.test(clues)) {
    return 'companyName'
  }
  if (/job.*title|title|position|cargo|titre|職位/.test(clues)) {
    return 'jobTitle'
  }

  // Other patterns
  if (/username|user.*name|login/.test(clues)) {
    return 'username'
  }
  if (/password|contraseña|mot de passe|パスワード/.test(clues)) {
    return 'password'
  }
  if (/url|website|site.*web/.test(clues)) {
    return 'url'
  }
  if (/note|comment|message|mensaje|コメント/.test(clues)) {
    return 'note'
  }

  // Fallback to generic text
  return 'text'
}

/**
 * Generate appropriate value based on inferred intent
 */
function generateValue(intent: string, field: FieldSchema, mode: 'fill-empty' | 'complete' | 'single-field', currentValue?: string): string {
  // Handle checkboxes - return 'on' to check them
  if (field.type === 'checkbox') {
    // For required checkboxes (like terms), always check
    if (field.required) {
      return 'on'
    }

    // For optional checkboxes, check based on intent/label
    const clues = [field.name, field.id, field.label, field.aiIntent]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    // Likely should be checked: terms, agree, consent, etc.
    if (/terms|agree|consent|accept|policy|confirm/i.test(clues)) {
      return 'on'
    }

    // Likely optional: newsletter, marketing, updates
    if (/newsletter|marketing|promo|email.*update|notification/i.test(clues)) {
      // In single-field mode: randomize to create variety (like faker generates different names)
      if (mode === 'single-field') {
        return faker.datatype.boolean() ? 'on' : ''
      }
      // In fill-empty/complete mode, default to unchecked (user can opt-in explicitly)
      return ''
    }

    // Default for other optional checkboxes in single-field mode: randomize
    if (mode === 'single-field') {
      return faker.datatype.boolean() ? 'on' : ''
    }

    // Default: check optional checkboxes
    return 'on'
  }

  // Handle radio buttons - pick first option if available, or a default value
  if (field.type === 'radio') {
    // Radio buttons should have been filtered to one per group
    // For now, return a sensible default (this needs enhancement)
    if (field.id === 'deliverySpeed' || /delivery.*speed/i.test(field.label || '')) {
      const options = ['standard', 'express', 'overnight']
      // In single-field mode with a current value, cycle to the next option
      if (mode === 'single-field' && currentValue) {
        const currentIndex = options.indexOf(currentValue)
        if (currentIndex !== -1) {
          return options[(currentIndex + 1) % options.length]
        }
      }
      return faker.helpers.arrayElement(options)
    }
    // Generic radio: return 'on' to select it
    return 'on'
  }

  // Handle select fields with options
  if (field.type === 'select' && field.options && field.options.length > 0) {
    // In single-field mode with a current value, cycle to the next option
    if (mode === 'single-field' && currentValue) {
      const currentIndex = field.options.indexOf(currentValue)
      if (currentIndex !== -1 && field.options.length > 1) {
        return field.options[(currentIndex + 1) % field.options.length]
      }
    }
    return faker.helpers.arrayElement(field.options)
  }

  // Handle specific intents
  switch (intent) {
    case 'firstName':
      return faker.person.firstName()
    case 'lastName':
      return faker.person.lastName()
    case 'fullName':
      return faker.person.fullName()
    case 'email':
      return faker.internet.email()
    case 'phone':
      return faker.phone.number()
    case 'streetAddress':
      return faker.location.streetAddress()
    case 'streetAddress2':
      return faker.location.secondaryAddress()
    case 'city':
      return faker.location.city()
    case 'state':
      return faker.location.state({ abbreviated: true })
    case 'zipCode':
      return faker.location.zipCode()
    case 'country':
      return faker.location.countryCode()
    case 'creditCard':
      // Use valid test card numbers
      return faker.helpers.arrayElement([
        '4242 4242 4242 4242',
        '5555 5555 5555 4444',
      ])
    case 'cvv':
      return faker.string.numeric(3)
    case 'cardExpiry':
      // Generate future date in MM/YY format
      const currentYear = new Date().getFullYear() % 100
      const futureYear = (currentYear + faker.number.int({ min: 1, max: 3 })) % 100
      const month = faker.number.int({ min: 1, max: 12 }).toString().padStart(2, '0')
      const year = futureYear.toString().padStart(2, '0')
      return `${month}/${year}`
    case 'birthDate':
      return faker.date.birthdate().toISOString().split('T')[0]
    case 'date':
      return faker.date.future().toISOString().split('T')[0]
    case 'time':
      return faker.date.recent().toTimeString().split(' ')[0].slice(0, 5)
    case 'companyName':
      return faker.company.name()
    case 'jobTitle':
      return faker.person.jobTitle()
    case 'username':
      return faker.internet.userName()
    case 'password':
      return faker.internet.password()
    case 'url':
      return faker.internet.url()
    case 'note':
      return faker.lorem.sentence()
    case 'number':
      const min = field.min ? parseInt(field.min) : 1
      const max = field.max ? parseInt(field.max) : 100
      return faker.number.int({ min, max }).toString()
    case 'text':
    default:
      return faker.lorem.words(2)
  }
}

/**
 * Route handler
 */
export const Route = createFileRoute('/api/ai-suggest-fields')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Check if AI agent is enabled
        if (import.meta.env.VITE_ENABLE_AI_AGENT !== 'true') {
          return json({ suggestions: [] })
        }

        try {
          const body = (await request.json()) as SuggestionRequest
          const { fields, currentValues, mode } = body

          console.log('[API] ai-suggest-fields request:', {
            mode,
            fieldCount: fields.length,
            fields: fields.map(f => ({ id: f.id, type: f.type, label: f.label }))
          })

          // Load form context (LLM-generated mappings)
          const formContext = await loadFormContext()
          const route = request.headers.get('referer')?.split(request.url.split('/').slice(0, 3).join('/'))[1]?.split('?')[0] || '/'

          const suggestions: FieldSuggestion[] = []

          for (const field of fields) {
            // Skip buttons (submit, reset, etc.)
            if (field.type === 'button' || field.type === 'submit' || field.type === 'reset') {
              continue
            }

            // IMPORTANT: Only use currentValues (live state), NOT field.currentValue (stale snapshot)
            const currentValue = currentValues[field.id] || ''

            console.log('[API] Processing field:', {
              id: field.id,
              name: field.name,
              type: field.type,
              label: field.label,
              currentValueFromProps: currentValues[field.id],
              finalCurrentValue: currentValue,
              willSkip: mode === 'fill-empty' && currentValue
            })

            // Mode: single-field - always process (used when user clicks ✨ on a specific field)
            // This allows re-evaluation of checkboxes/radios even if already checked
            if (mode === 'single-field') {
              console.log('[API] Single-field mode: always processing:', field.id)
              // Don't skip, process this field regardless of current value
            }
            // Mode: fill-empty - only fill empty fields
            // For checkboxes, empty means unchecked (value === '')
            // For radio, empty means no selection (value === '')
            else if (mode === 'fill-empty' && currentValue) {
              console.log('[API] Skipping field (already has value):', field.id)
              continue
            }
            // Mode: complete - validate and fix existing values, fill empty
            else if (mode === 'complete' && currentValue) {
              const isValid = validateFieldValue(field, currentValue)
              if (isValid) {
                console.log('[API] Skipping field (value is valid):', field.id, currentValue)
                continue
              } else {
                console.log('[API] Field has invalid value, will fix:', field.id, currentValue)
              }
            }

            let value: string
            let reasoning: string

            // Try to use LLM-generated context first
            const contextMapping = formContext?.routes[route]?.fields[field.id]
            if (contextMapping && contextMapping.exampleValues.length > 0) {
              // Use LLM-generated example value
              value = faker.helpers.arrayElement(contextMapping.exampleValues)
              reasoning = `From form context: "${contextMapping.description}"`
            } else {
              // Fall back to faker pattern matching
              const intent = inferFieldIntent(field)
              value = generateValue(intent, field, mode, currentValue)
              reasoning = `Inferred as "${intent}" from field clues (no form context)`

              // Detailed logging for debugging
              console.log('[API] Field inference:', {
                id: field.id,
                name: field.name,
                type: field.type,
                label: field.label,
                aiIntent: field.aiIntent,
                inferredIntent: intent,
                currentValue,
                generatedValue: value,
                valueType: typeof value,
                mode
              })
            }

            console.log('[API] Generated suggestion:', { fieldId: field.id, value, reasoning, valueType: typeof value })

            suggestions.push({
              fieldId: field.id,
              value,
              reasoning,
            })
          }

          console.log('[API] Returning suggestions:', {
            count: suggestions.length,
            suggestions: suggestions.map(s => ({ fieldId: s.fieldId, value: s.value.slice(0, 20) }))
          })

          return json({ suggestions })
        } catch (error) {
          console.error('[AI Suggest Fields] Error:', error)
          return json({ error: 'Internal server error' }, { status: 500 })
        }
      },
    },
  },
})
