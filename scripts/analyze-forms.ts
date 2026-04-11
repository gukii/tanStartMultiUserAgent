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
  validationHint?: string // Extracted from server validation code
}

interface FieldMapping {
  intent: string
  description: string
  format?: string
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
    // Always grep across all route files
    const command = `grep -rl "form\\|input" src/routes --include="*.tsx"`
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
      // If --route filter provided, only return matching routes
      .filter(route => !routeFilter || route === routeFilter)

    console.log(`[Discovery] Found ${routes.length} routes:`, routes)
    return routes
  } catch (error) {
    console.error('[Discovery] Error:', error)
    return []
  }
}

// ---------------------------------------------------------------------------
// Source Code Parsing (forms are client-side rendered, not in SSR HTML)
// ---------------------------------------------------------------------------

/**
 * Convert a route path to the most likely source file path(s).
 * e.g. /demo-telemetry -> src/routes/demo-telemetry.tsx
 *      /order-form     -> src/routes/_collab.order-form.tsx
 */
function routeToSourceFiles(route: string): string[] {
  const slug = route.replace(/^\//, '') // strip leading /
  const candidates = [
    `src/routes/${slug}.tsx`,
    `src/routes/_collab.${slug.replace(/\//g, '.')}.tsx`,
    `src/routes/${slug.replace(/\//g, '.')}.tsx`,
  ]
  return candidates.filter(f => {
    try { readFileSync(f); return true } catch { return false }
  })
}

/**
 * Extract a JSX prop value (string literal or {expression}) from source text
 * starting at `pos`. Returns the string value or undefined.
 */
function extractPropValue(src: string, pos: number): string | undefined {
  const ch = src[pos]
  if (ch === '"' || ch === "'") {
    const end = src.indexOf(ch, pos + 1)
    return end > pos ? src.slice(pos + 1, end) : undefined
  }
  if (ch === '{') {
    // Find matching }
    let depth = 1; let i = pos + 1
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') depth--
      i++
    }
    const expr = src.slice(pos + 1, i - 1).trim()
    // Only use simple string literals inside braces: {"value"} or {'value'}
    const m = expr.match(/^["'](.*)["']$/)
    return m ? m[1] : undefined
  }
  return undefined
}

/**
 * Parse a JSX element's props from source text.
 * Returns a map of prop name → string value (only string-valued props).
 */
function parseJSXProps(elementSrc: string): Record<string, string> {
  const props: Record<string, string> = {}
  // Match: propName="value", propName='value', propName={"value"}, propName={expr}
  const propRe = /\b([\w-]+)=(?:"([^"]*?)"|'([^']*?)'|\{([^}]*?)\})/g
  let m: RegExpExecArray | null
  while ((m = propRe.exec(elementSrc)) !== null) {
    const name = m[1]
    const val = m[2] ?? m[3] ?? m[4]?.replace(/^["']|["']$/g, '') ?? ''
    props[name] = val
  }
  return props
}

/**
 * Extract all <option value="..."> values from a <select>...</select> block.
 */
function extractOptions(selectBlock: string): string[] {
  const opts: string[] = []
  const re = /<option[^>]+value=(?:"([^"]*?)"|'([^']*?)'|\{["']([^"']*?)["']\})/g
  let m: RegExpExecArray | null
  while ((m = re.exec(selectBlock)) !== null) {
    const val = m[1] ?? m[2] ?? m[3]
    if (val) opts.push(val)
  }
  return opts
}

function extractFieldInfoFromSource(route: string): FieldInfo[] {
  const sourceFiles = routeToSourceFiles(route)
  if (sourceFiles.length === 0) {
    console.log(`[Parse] No source file found for route ${route}`)
    return []
  }

  // Extract validation hints from server functions imported by this route
  const validationHints = extractValidationHints(sourceFiles)
  if (Object.keys(validationHints).length > 0) {
    console.log(`[Validation] Found hints for fields: ${Object.keys(validationHints).join(', ')}`)
  }

  const fields: FieldInfo[] = []
  const seen = new Set<string>()

  for (const filePath of sourceFiles) {
    console.log(`[Parse] Reading source: ${filePath}`)
    const src = readFileSync(filePath, 'utf-8')

    // Build context from string literals that look like headings / labels
    const contextMatches = src.match(/["'`]([A-Z][^"'`\n]{5,80})["'`]/g) || []
    const context = contextMatches.slice(0, 10).join(' ').slice(0, 500)

    // Find all <input, <select, <textarea JSX elements
    const elementRe = /<(input|select|textarea)(\s[^>]*?)(?:\/>|>)/gs
    let match: RegExpExecArray | null

    while ((match = elementRe.exec(src)) !== null) {
      const tag = match[1].toLowerCase()
      const attrBlock = match[2]
      const props = parseJSXProps(attrBlock)

      const type = props['type'] || (tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : 'text')

      // Skip submit/button/reset/hidden
      if (['submit', 'button', 'reset', 'hidden'].includes(type)) continue

      const name = props['name'] || ''
      if (!name) continue
      if (seen.has(name)) continue
      seen.add(name)

      // For select: grab the block up to </select> and extract options
      let options: string[] | undefined
      if (tag === 'select') {
        const closeIdx = src.indexOf('</select>', match.index)
        if (closeIdx > match.index) {
          options = extractOptions(src.slice(match.index, closeIdx + 9))
        }
      }

      // Try to find label: look for label text near the element in source
      const before = src.slice(Math.max(0, match.index - 400), match.index)
      const labelMatches = before.match(/["'`]([A-Z][^"'`\n]{2,50})["'`]/g) || []
      const label = labelMatches.length > 0
        ? labelMatches[labelMatches.length - 1].replace(/^["'`]|["'`]$/g, '')
        : ''

      // Attach validation hint if available (try exact name, then case-insensitive)
      const validationHint = validationHints[name]
        ?? validationHints[name.toLowerCase()]
        ?? Object.entries(validationHints).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1]

      fields.push({
        id: name,
        name,
        type,
        label,
        placeholder: props['placeholder'] || '',
        currentValue: '',
        options,
        context,
        validationHint,
      })
    }
  }

  console.log(`[Parse] Found ${fields.length} fields in ${route}`)
  return fields
}

// ---------------------------------------------------------------------------
// Validation Source Extraction
// ---------------------------------------------------------------------------

/**
 * Find server function / validation files imported by a route source file.
 * Returns a map of fieldName -> validation code snippet.
 *
 * Strategy:
 * 1. Scan the route file for imports of .server.ts files
 * 2. Read those files and extract per-field validation functions by looking
 *    for functions whose name or body references the field name
 */
function extractValidationHints(routeSourceFiles: string[]): Record<string, string> {
  const hints: Record<string, string> = {}

  for (const sourceFile of routeSourceFiles) {
    let src: string
    try { src = readFileSync(sourceFile, 'utf-8') } catch { continue }

    // Find imports of .server files (e.g. import { submitCheckout } from '../lib/submitCheckout.server')
    const importRe = /from\s+['"]([^'"]+\.server(?:\.ts)?)['"]/g
    let m: RegExpExecArray | null

    while ((m = importRe.exec(src)) !== null) {
      const importPath = m[1]
      // Resolve relative to the source file's directory
      const sourceDir = sourceFile.split('/').slice(0, -1).join('/')
      const candidates = [
        join(sourceDir, importPath + '.ts'),
        join(sourceDir, importPath),
        join(process.cwd(), importPath.replace(/^\.\.\//, 'src/') + '.ts'),
        join(process.cwd(), importPath.replace(/^\.\.\//, 'src/')),
      ]

      let validationSrc = ''
      for (const candidate of candidates) {
        try { validationSrc = readFileSync(candidate, 'utf-8'); break } catch { /* try next */ }
      }

      if (!validationSrc) {
        console.log(`[Validation] Could not find server file: ${importPath}`)
        continue
      }

      console.log(`[Validation] Reading server file: ${importPath}`)
      extractPerFieldHints(validationSrc, hints)
    }
  }

  return hints
}

/**
 * Extract per-field validation snippets from a server function file.
 * Looks for functions like validateCVV, validateCardNumber, validateExpiry etc.
 * and maps them to field names.
 */
function extractPerFieldHints(src: string, hints: Record<string, string>): void {
  // Extract all top-level functions (function declarations and arrow functions assigned to const)
  const fnRe = /(?:^|\n)(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\([^)]*\)|[\w]+)\s*=>)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/gm
  let m: RegExpExecArray | null

  while ((m = fnRe.exec(src)) !== null) {
    const fnName = (m[1] || m[2] || '').toLowerCase()
    const body = m[3] || ''

    // Map function names to field names
    // e.g. validateCVV -> cvv, validateCardNumber -> cardNumber, validateExpiry -> expiry
    const fieldGuesses: string[] = []

    if (/cvv|cvc/.test(fnName)) fieldGuesses.push('cvv', 'cvc')
    if (/card/.test(fnName)) fieldGuesses.push('cardNumber', 'card', 'cardnumber')
    if (/expir/.test(fnName)) fieldGuesses.push('expiry', 'expiration', 'expiryDate')
    if (/email/.test(fnName)) fieldGuesses.push('email')
    if (/country/.test(fnName)) fieldGuesses.push('country')
    if (/phone|tel/.test(fnName)) fieldGuesses.push('phone', 'tel', 'mobile')
    if (/zip|postal/.test(fnName)) fieldGuesses.push('zipCode', 'zip', 'postalCode')
    if (/password/.test(fnName)) fieldGuesses.push('password')
    if (/username|login/.test(fnName)) fieldGuesses.push('username')

    // Also scan the body for field name references (for generic handlers)
    const bodyFieldRe = /formData\.(\w+)|data\.(\w+)|field\s*===?\s*['"](\w+)['"]/g
    let bm: RegExpExecArray | null
    while ((bm = bodyFieldRe.exec(body)) !== null) {
      const name = bm[1] || bm[2] || bm[3]
      if (name) fieldGuesses.push(name)
    }

    if (fieldGuesses.length === 0) continue

    // Condense the body to key constraints only
    // Extract: regex tests, length checks, array membership checks, error messages
    const constraints: string[] = []

    // Regex patterns: /pattern/.test(...)
    const regexRe = /\/([^/\n]{2,60})\/[gimsuy]*\.test\(/g
    let rm: RegExpExecArray | null
    while ((rm = regexRe.exec(body)) !== null) {
      constraints.push(`Must match regex: /${rm[1]}/`)
    }

    // Array includes: ['a','b'].includes(x)
    const arrRe = /\[([^\]]{2,200})\]\.includes\(/g
    let am: RegExpExecArray | null
    while ((am = arrRe.exec(body)) !== null) {
      constraints.push(`Must be one of: ${am[1]}`)
    }

    // Length checks: .length < N, .length > N
    const lenRe = /\.length\s*([<>]=?)\s*(\d+)/g
    let lm: RegExpExecArray | null
    while ((lm = lenRe.exec(body)) !== null) {
      constraints.push(`Length ${lm[1]} ${lm[2]}`)
    }

    // Error messages (usually describe the constraint clearly)
    const errRe = /return\s+['"`]([^'"`\n]{5,120})['"`]/g
    let em: RegExpExecArray | null
    while ((em = errRe.exec(body)) !== null) {
      constraints.push(`Validation rule: "${em[1]}"`)
    }

    if (constraints.length === 0) continue

    const hint = constraints.join('\n')
    for (const field of fieldGuesses) {
      if (!hints[field]) hints[field] = hint
    }
  }
}

// ---------------------------------------------------------------------------
// LLM Integration
// ---------------------------------------------------------------------------

async function analyzeFieldWithLLM(field: FieldInfo): Promise<FieldMapping> {
  // For fields where LLM adds no value, return deterministic results immediately
  if (field.type === 'checkbox') {
    return {
      intent: `checkbox: ${field.label || field.name}`,
      description: `Checkbox. Use "on" to check, "" to uncheck.`,
      exampleValues: ['on', ''],
    }
  }

  // For select/radio with known options, LLM just needs to pick from them
  const hasOptions = field.options && field.options.length > 0

  // Build format hint from placeholder
  const formatHint = field.placeholder
    ? `\n- Expected format (from placeholder): "${field.placeholder}" — your values MUST match this format exactly.`
    : ''

  // Build type-specific instructions
  let typeInstructions = ''
  if (field.type === 'number') {
    const rangeHint = field.min !== undefined || field.max !== undefined
      ? ` between ${field.min ?? '(no min)'} and ${field.max ?? '(no max)'}`
      : ''
    typeInstructions = `\nIMPORTANT: This is a number field${rangeHint}. All exampleValues must be valid numbers as strings (e.g. "5", "12"). No decimals unless the field semantically requires them. No negative values unless meaningful. No infinity or non-numeric strings.`
  } else if (field.type === 'date') {
    const today = new Date().toISOString().split('T')[0]
    typeInstructions = `\nIMPORTANT: This is a date field. All exampleValues must be future dates in YYYY-MM-DD format. Today is ${today}. Do not use past dates.`
  } else if (field.type === 'email') {
    typeInstructions = `\nIMPORTANT: All exampleValues must be valid email addresses (user@domain.tld format).`
  } else if (hasOptions) {
    typeInstructions = `\nIMPORTANT: This field has fixed options. ALL exampleValues must be chosen ONLY from this exact list: [${field.options!.join(', ')}]. Do not invent new values.`
  }

  const validationSection = field.validationHint
    ? `\nServer-side validation constraints (your values MUST satisfy ALL of these):\n${field.validationHint}`
    : ''

  const prompt = `You are analyzing a form field to generate realistic test data.

Field Information:
- Name: ${field.name}
- Type: ${field.type}
- Label: ${field.label}${formatHint}
${hasOptions ? `- Available options (use ONLY these): ${field.options!.join(', ')}` : ''}${validationSection}

Page Context: ${field.context}

Task: Generate 10 diverse, realistic example values for this field that would pass server-side validation.
The "format" field should describe the exact expected input format (e.g. "MM/YY", "16 digits with spaces", "ISO country code", "city name").${typeInstructions}

Respond in JSON format only, no explanation:
{
  "intent": "one-line description of what this field is for",
  "description": "what this field represents including its format constraints",
  "format": "exact input format expected",
  "exampleValues": ["value1", "value2", "value3", "value4", "value5", "value6", "value7", "value8", "value9", "value10"]
}`

  if (LLM_PROVIDER === 'ollama') {
    return analyzeWithOllama(prompt, field)
  } else if (LLM_PROVIDER === 'openai') {
    return analyzeWithOpenAI(prompt, field)
  } else {
    throw new Error(`Unknown LLM provider: ${LLM_PROVIDER}`)
  }
}

/**
 * Post-process and validate LLM-generated example values.
 * Filters out values that clearly don't match the field's constraints.
 */
function validateExamples(values: string[], field: FieldInfo): string[] {
  return values
    .map(v => String(v).trim())
    .filter(v => {
      if (!v) return field.type === 'checkbox' // only keep empty string for checkboxes

      // For select/radio: must be one of the known options
      if (field.options && field.options.length > 0) {
        return field.options.includes(v)
      }

      // Number fields: must be a finite number
      if (field.type === 'number') {
        const n = Number(v)
        if (!isFinite(n)) return false
        if (field.min !== undefined && n < Number(field.min)) return false
        if (field.max !== undefined && n > Number(field.max)) return false
        return true
      }

      // Date fields: must be a valid future date in YYYY-MM-DD
      if (field.type === 'date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
        return new Date(v) > new Date()
      }

      // Email fields: basic format check
      if (field.type === 'email') {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
      }

      return true
    })
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

    const rawValues: string[] = Array.isArray(parsed.exampleValues) ? parsed.exampleValues : []
    const validValues = validateExamples(rawValues, field)

    if (validValues.length < rawValues.length) {
      console.log(`  ⚠ Filtered ${rawValues.length - validValues.length} invalid values for ${field.name}`)
    }

    return {
      intent: parsed.intent || field.name,
      description: parsed.description || field.label,
      format: parsed.format,
      exampleValues: validValues,
    }
  } catch (error) {
    console.error(`[LLM] Error analyzing ${field.name}:`, error)
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

    const rawValues: string[] = Array.isArray(parsed.exampleValues) ? parsed.exampleValues : []
    const validValues = validateExamples(rawValues, field)

    return {
      intent: parsed.intent || field.name,
      description: parsed.description || field.label,
      format: parsed.format,
      exampleValues: validValues,
    }
  } catch (error) {
    console.error(`[LLM] Error analyzing ${field.name}:`, error)
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

    // Extract fields from source (forms are client-side, SSR HTML won't contain them)
    const fields = extractFieldInfoFromSource(route)
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
