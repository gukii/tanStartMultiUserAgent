/**
 * normalBehavior.server.ts
 *
 * TanStack Start Server Function – Historical Guardrails for AI Agents.
 *
 * Returns "normal behaviour" metadata for a given route: typical field values,
 * validation rules, and field descriptions. An LLM Agent calls this before
 * filling a form so it has context on what inputs are expected and what the
 * usual patterns look like.
 *
 * In production you would query a database of historical form submissions
 * aggregated per route. This file ships a static fixture as a starting point.
 */

import { createServerFn } from '@tanstack/react-start'
import type { NormalBehaviorData } from '../types/collaboration'

// Static fixtures – replace with DB queries in production
const ROUTE_BEHAVIORS: Record<string, NormalBehaviorData['fields']> = {
  '/demo': {
    firstName: {
      typicalValues: ['Alice', 'Bob', 'Charlie', 'Diana'],
      validationRules: 'Non-empty, letters and hyphens only, max 50 chars',
      description: 'Customer first name',
    },
    lastName: {
      typicalValues: ['Smith', 'Jones', 'Williams', 'Brown'],
      validationRules: 'Non-empty, letters and hyphens only, max 50 chars',
      description: 'Customer last name',
    },
    email: {
      typicalValues: ['alice@example.com', 'user@company.org'],
      validationRules: 'Valid RFC 5322 email address',
      description: 'Customer email – used for order confirmation',
    },
    cardNumber: {
      typicalValues: ['4242 4242 4242 4242'],
      validationRules: '16 digits, Luhn-valid, spaces allowed',
      description: 'Credit/debit card number',
    },
    expiry: {
      typicalValues: ['12/26', '01/27'],
      validationRules: 'MM/YY format, must be a future date',
      description: 'Card expiry date',
    },
    cvv: {
      typicalValues: ['123', '456'],
      validationRules: '3 digits (VISA/MC) or 4 digits (Amex)',
      description: 'Card security code – never store or log',
    },
    address: {
      typicalValues: ['123 Main St', '456 Oak Avenue'],
      validationRules: 'Non-empty, max 100 chars',
      description: 'Street address including house number',
    },
    city: {
      typicalValues: ['San Francisco', 'New York', 'Berlin', 'London'],
      validationRules: 'Non-empty, max 50 chars',
      description: 'Shipping city',
    },
    country: {
      typicalValues: ['US', 'DE', 'GB'],
      validationRules: 'ISO 3166-1 alpha-2 code',
      description: 'Shipping country',
    },
    notes: {
      typicalValues: ['Leave at door', 'Ring bell', ''],
      validationRules: 'Optional, max 500 chars',
      description: 'Special delivery instructions',
    },
  },
}

/**
 * Server function called by the AI Agent (or demo panel) to fetch
 * normalised field-behaviour data for a route.
 *
 * Usage (from any client component or AI Agent):
 *   const hints = await getNormalBehavior({ data: '/demo' })
 */
export const getNormalBehavior = createServerFn({ method: 'GET' })
  .inputValidator((route: unknown): string => {
    if (typeof route !== 'string') throw new Error('route must be a string')
    return route
  })
  .handler(async (ctx): Promise<NormalBehaviorData> => {
    const route = ctx.data
    const fields = ROUTE_BEHAVIORS[route] ?? {}
    return { route, fields }
  })
