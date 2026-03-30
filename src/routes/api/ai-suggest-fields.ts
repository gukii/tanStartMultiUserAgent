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
  mode: 'fill-empty' | 'complete'
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
 * Infer field intent from all available clues
 * Supports English and Unicode patterns (Chinese, Japanese, etc.)
 */
function inferFieldIntent(field: FieldSchema): string {
  // Priority 1: Explicit aiIntent
  if (field.aiIntent) {
    return field.aiIntent
  }

  // Priority 2: Type attribute
  if (field.type === 'email') return 'email'
  if (field.type === 'tel') return 'phone'
  if (field.type === 'url') return 'url'
  if (field.type === 'date') return 'date'
  if (field.type === 'time') return 'time'
  if (field.type === 'number') return 'number'
  if (field.type === 'password') return 'password'

  // Priority 3: Pattern matching on combined clues
  const clues = [
    field.name,
    field.id,
    field.label,
    field.placeholder,
    field.ariaLabel,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

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

  // Payment patterns
  if (/card.*number|credit.*card|número.*tarjeta|numéro.*carte|カード番号/.test(clues)) {
    return 'creditCard'
  }
  if (/cvv|cvc|security.*code|código.*seguridad/.test(clues)) {
    return 'cvv'
  }
  if (/expir|expiry|exp.*date|vencimiento|有効期限/.test(clues)) {
    return 'cardExpiry'
  }

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
function generateValue(intent: string, field: FieldSchema): string {
  // Handle select fields with options
  if (field.type === 'select' && field.options && field.options.length > 0) {
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
  handler: async ({ request }) => {
    // Check if AI agent is enabled
    if (import.meta.env.VITE_ENABLE_AI_AGENT !== 'true') {
      return json({ suggestions: [] })
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 })
    }

    try {
      const body = (await request.json()) as SuggestionRequest
      const { fields, currentValues, mode } = body

      // Load form context (LLM-generated mappings)
      const formContext = await loadFormContext()
      const route = request.headers.get('referer')?.split(request.url.split('/').slice(0, 3).join('/'))[1]?.split('?')[0] || '/'

      const suggestions: FieldSuggestion[] = []

      for (const field of fields) {
        // Skip buttons
        if (field.type === 'button' || field.type === 'submit') {
          continue
        }

        const currentValue = currentValues[field.id] || field.currentValue || ''

        // Mode: fill-empty - only fill empty fields
        if (mode === 'fill-empty' && currentValue) {
          continue
        }

        // Mode: complete - validate and fix existing values, fill empty
        // For now, we'll implement simple fill. Future: add validation and fixing logic

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
          value = generateValue(intent, field)
          reasoning = `Inferred as "${intent}" from field clues (no form context)`
        }

        suggestions.push({
          fieldId: field.id,
          value,
          reasoning,
        })
      }

      return json({ suggestions })
    } catch (error) {
      console.error('[AI Suggest Fields] Error:', error)
      return json({ error: 'Internal server error' }, { status: 500 })
    }
  },
})
