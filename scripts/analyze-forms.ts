/**
 * Form Analysis Script
 *
 * Analyzes form fields across routes and generates domain-appropriate
 * test data suggestions using a local LLM (Ollama).
 *
 * Usage:
 *   pnpm analyze-forms                    # Analyze all routes
 *   pnpm analyze-forms --route=/demo      # Analyze specific route
 *
 * Requirements:
 *   - Dev server running (pnpm dev)
 *   - Ollama running locally (ollama serve)
 *   - LLM model installed (ollama pull phi3:mini)
 */

import { execSync } from 'child_process'
import { writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import * as cheerio from 'cheerio'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEV_SERVER_URL = process.env.DEV_SERVER_URL || 'http://localhost:3000'
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'ollama'
const LLM_HOST = process.env.LLM_HOST || 'http://localhost:11434'
const LLM_MODEL = process.env.LLM_MODEL || 'phi3:mini'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

const FORM_CONTEXT_PATH = join(process.cwd(), 'server', 'form-context.json')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldInfo {
  id: string
  name: string
  type: string
  label: string
  placeholder: string
  currentValue: string
  options?: string[]
  context: string // Surrounding page text for LLM
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

// ---------------------------------------------------------------------------
// Route Discovery
// ---------------------------------------------------------------------------

function findRoutesWithForms(routeFilter?: string): string[] {
  console.log('[Discovery] Scanning for routes with forms...')

  try {
    // Grep for files containing <form or <input tags
    const grepPattern = routeFilter || 'src/routes/**/*.tsx'
    const command = `grep -l "form\\|input" ${grepPattern}`
    const output = execSync(command, { encoding: 'utf-8' })

    // Convert file paths to route paths
    const files = output.trim().split('\n').filter(Boolean)
    const routes = files
      .map(file => {
        // src/routes/demo-telemetry.tsx -> /demo-telemetry
        // src/routes/_collab.order-form.tsx -> /order-form
        const routePath = file
          .replace('src/routes/', '')
          .replace(/\.(tsx|ts)$/, '')
          .replace(/^_collab\./, '') // Remove layout prefix
          .replace(/\./g, '/') // Handle nested routes
          .replace(/^index$/, '') // index -> root
        return '/' + routePath
      })
      .filter(route => !route.includes('_')) // Skip layout routes
      .filter(route => route !== '/analytics') // Skip analytics (no forms to fill)

    console.log(`[Discovery] Found ${routes.length} routes:`, routes)
    return routes
  } catch (error) {
    console.error('[Discovery] Error:', error)
    return []
  }
}

// ---------------------------------------------------------------------------
// HTML Fetching & Parsing
// ---------------------------------------------------------------------------

async function fetchRouteHTML(route: string): Promise<string> {
  const url = `${DEV_SERVER_URL}${route}`
  console.log(`[Fetch] Loading ${url}...`)

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.text()
  } catch (error) {
    console.error(`[Fetch] Error loading ${url}:`, error)
    return ''
  }
}

function extractFieldInfo(html: string, route: string): FieldInfo[] {
  const $ = cheerio.load(html)
  const fields: FieldInfo[] = []

  // Extract page context (for LLM)
  const pageTitle = $('h1, h2').first().text().trim()
  const pageText = $('p, label, legend').map((_, el) => $(el).text()).get().join(' ').trim()
  const context = `${pageTitle} ${pageText}`.slice(0, 500) // First 500 chars

  console.log(`[Parse] Page context: ${context.slice(0, 100)}...`)

  // Find all form fields
  $('form').each((_, form) => {
    $(form).find('input, textarea, select').each((_, element) => {
      const $el = $(element)
      const tag = element.tagName.toLowerCase()

      // Skip buttons
      const type = $el.attr('type') || 'text'
      if (type === 'submit' || type === 'button') return

      const name = $el.attr('name') || $el.attr('id') || ''
      if (!name) return // Skip unnamed fields

      // Find label
      let label = ''
      const id = $el.attr('id')
      if (id) {
        label = $(`label[for="${id}"]`).text().trim()
      }
      if (!label) {
        label = $el.closest('label').text().trim()
      }

      // Extract options for select
      let options: string[] | undefined
      if (tag === 'select') {
        options = $el.find('option')
          .map((_, opt) => $(opt).attr('value'))
          .get()
          .filter(Boolean)
      }

      fields.push({
        id: name,
        name,
        type,
        label,
        placeholder: $el.attr('placeholder') || '',
        currentValue: $el.attr('value') || '',
        options,
        context,
      })
    })
  })

  console.log(`[Parse] Found ${fields.length} fields in ${route}`)
  return fields
}

// ---------------------------------------------------------------------------
// LLM Integration
// ---------------------------------------------------------------------------

async function analyzeFieldWithLLM(field: FieldInfo): Promise<FieldMapping> {
  const prompt = `You are analyzing a form field to generate realistic test data.

Field Information:
- Name: ${field.name}
- Type: ${field.type}
- Label: ${field.label}
- Placeholder: ${field.placeholder}
${field.options ? `- Options: ${field.options.join(', ')}` : ''}

Page Context: ${field.context}

Task: Generate 10 diverse, realistic example values for this field.
${field.options ? 'Pick from the provided options.' : ''}

Respond in JSON format only:
{
  "intent": "brief description of field purpose",
  "description": "what this field represents",
  "exampleValues": ["value1", "value2", ...]
}`

  if (LLM_PROVIDER === 'ollama') {
    return analyzeWithOllama(prompt, field)
  } else if (LLM_PROVIDER === 'openai') {
    return analyzeWithOpenAI(prompt, field)
  } else {
    throw new Error(`Unknown LLM provider: ${LLM_PROVIDER}`)
  }
}

async function analyzeWithOllama(prompt: string, field: FieldInfo): Promise<FieldMapping> {
  try {
    const response = await fetch(`${LLM_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        format: 'json',
      }),
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.message?.content || '{}'
    const parsed = JSON.parse(content)

    return {
      intent: parsed.intent || field.name,
      description: parsed.description || field.label,
      exampleValues: parsed.exampleValues || [],
    }
  } catch (error) {
    console.error(`[LLM] Error analyzing ${field.name}:`, error)
    // Fallback
    return {
      intent: field.name,
      description: field.label || field.placeholder,
      exampleValues: [],
    }
  }
}

async function analyzeWithOpenAI(prompt: string, field: FieldInfo): Promise<FieldMapping> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set')
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(content)

    return {
      intent: parsed.intent || field.name,
      description: parsed.description || field.label,
      exampleValues: parsed.exampleValues || [],
    }
  } catch (error) {
    console.error(`[LLM] Error analyzing ${field.name}:`, error)
    // Fallback
    return {
      intent: field.name,
      description: field.label || field.placeholder,
      exampleValues: [],
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('[Form Analysis] Starting...')
  console.log(`[Config] LLM Provider: ${LLM_PROVIDER}`)
  console.log(`[Config] Model: ${LLM_MODEL}`)
  console.log(`[Config] Dev Server: ${DEV_SERVER_URL}`)

  // Parse arguments
  const args = process.argv.slice(2)
  const routeFilterIndex = args.indexOf('--route')
  const routeFilter = routeFilterIndex >= 0 ? args[routeFilterIndex + 1] : undefined

  if (routeFilter) {
    console.log(`[Filter] Analyzing route: ${routeFilter}`)
  }

  // Find routes
  const routes = findRoutesWithForms(routeFilter)

  if (routes.length === 0) {
    console.log('[Analysis] No routes found. Exiting.')
    return
  }

  // Load existing context or create new
  let formContext: FormContext
  try {
    const existing = readFileSync(FORM_CONTEXT_PATH, 'utf-8')
    formContext = JSON.parse(existing)
    console.log('[Context] Loaded existing form-context.json')
  } catch {
    formContext = {
      analyzedAt: new Date().toISOString(),
      routes: {},
    }
    console.log('[Context] Creating new form-context.json')
  }

  // Analyze each route
  for (const route of routes) {
    console.log(`\n[Route] Analyzing ${route}...`)

    // Fetch HTML
    const html = await fetchRouteHTML(route)
    if (!html) {
      console.log(`[Route] Skipping ${route} (no HTML)`)
      continue
    }

    // Extract fields
    const fields = extractFieldInfo(html, route)
    if (fields.length === 0) {
      console.log(`[Route] Skipping ${route} (no fields found)`)
      continue
    }

    // Analyze each field with LLM
    const fieldMappings: Record<string, FieldMapping> = {}
    for (const field of fields) {
      console.log(`[LLM] Analyzing field: ${field.name}...`)
      const mapping = await analyzeFieldWithLLM(field)
      fieldMappings[field.id] = mapping

      // Log result
      console.log(`  → Intent: ${mapping.intent}`)
      console.log(`  → Examples: ${mapping.exampleValues.slice(0, 3).join(', ')}...`)
    }

    // Store in context
    formContext.routes[route] = { fields: fieldMappings }
  }

  // Update timestamp
  formContext.analyzedAt = new Date().toISOString()

  // Write to file
  writeFileSync(FORM_CONTEXT_PATH, JSON.stringify(formContext, null, 2), 'utf-8')
  console.log(`\n[Done] Wrote form context to ${FORM_CONTEXT_PATH}`)
  console.log(`[Summary] Analyzed ${Object.keys(formContext.routes).length} routes`)
}

main().catch(error => {
  console.error('[Error]', error)
  process.exit(1)
})
