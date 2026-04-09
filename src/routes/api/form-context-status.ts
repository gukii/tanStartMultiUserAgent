/**
 * API Route: /api/form-context-status
 *
 * Returns metadata about server/form-context.json:
 * whether it exists, when it was last analyzed, and a summary of covered routes/fields.
 * Used by AIAgentButtons to surface a notice when analysis hasn't been run.
 */

import { createFileRoute } from '@tanstack/react-router'

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
}

interface FieldMapping {
  intent: string
  description: string
  exampleValues: string[]
}

interface FormContext {
  analyzedAt: string
  routes: Record<string, { fields: Record<string, FieldMapping> }>
}

export interface FormContextStatus {
  exists: boolean
  analyzedAt: string | null
  /** Days since last analysis, null if never run */
  ageDays: number | null
  /** Total routes covered */
  routeCount: number
  /** Total fields analyzed across all routes */
  fieldCount: number
  /** Per-route details */
  routes: Record<string, { fieldCount: number; fields: Record<string, FieldMapping> }>
}

export const Route = createFileRoute('/api/form-context-status')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { readFileSync } = await import('fs')
          const { join } = await import('path')

          const contextPath = join(process.cwd(), 'server', 'form-context.json')
          const content = readFileSync(contextPath, 'utf-8')
          const ctx: FormContext = JSON.parse(content)

          const routeCount = Object.keys(ctx.routes).length
          let fieldCount = 0
          const routes: FormContextStatus['routes'] = {}

          for (const [route, routeData] of Object.entries(ctx.routes)) {
            const count = Object.keys(routeData.fields).length
            fieldCount += count
            routes[route] = { fieldCount: count, fields: routeData.fields }
          }

          const ageDays = ctx.analyzedAt
            ? Math.floor((Date.now() - new Date(ctx.analyzedAt).getTime()) / (1000 * 60 * 60 * 24))
            : null

          return json({
            exists: true,
            analyzedAt: ctx.analyzedAt,
            ageDays,
            routeCount,
            fieldCount,
            routes,
          } satisfies FormContextStatus)
        } catch {
          return json({
            exists: false,
            analyzedAt: null,
            ageDays: null,
            routeCount: 0,
            fieldCount: 0,
            routes: {},
          } satisfies FormContextStatus)
        }
      },
    },
  },
})
