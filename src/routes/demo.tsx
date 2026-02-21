/**
 * /demo – Checkout form wrapped with CollaborationHarness
 *
 * This route demonstrates all harness features:
 *   • Open in two browser tabs to see each other's ghost cursors
 *   • Type in any field to see it sync across tabs
 *   • Use the "Simulate AI Agent" panel to inject DRAFT_FIELD messages
 *     and experience the Accept / Reject suggestion flow
 *   • Click "Load AI hints" to fetch historical guardrails via a
 *     TanStack Server Function and pre-populate the AI's context
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState, useId } from 'react'
import { CollaborationHarness } from '../components/CollaborationHarness'
import { SubmitControl } from '../components/SubmitControl'
import { getNormalBehavior } from '../lib/normalBehavior.server'

export const Route = createFileRoute('/demo')({
  component: DemoPage,
})

// ---------------------------------------------------------------------------
// Simple checkout form (plain HTML – no special collaboration code needed)
// ---------------------------------------------------------------------------

function CheckoutForm() {
  const [submitted, setSubmitted] = useState(false)
  const firstId = useId()
  const lastId = useId()
  const emailId = useId()
  const cardId = useId()
  const expiryId = useId()
  const cvvId = useId()
  const addressId = useId()
  const cityId = useId()
  const countryId = useId()
  const notesId = useId()

  if (submitted) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <div className="mb-2 text-4xl">✅</div>
        <h2 className="text-xl font-semibold text-green-800">Order placed!</h2>
        <button
          className="mt-4 text-sm text-green-700 underline"
          onClick={() => setSubmitted(false)}
        >
          Reset form
        </button>
      </div>
    )
  }

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        setSubmitted(true)
      }}
    >
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="col-span-2 mb-1 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Personal details
        </legend>
        <div>
          <label htmlFor={firstId} className="mb-1 block text-sm font-medium text-gray-700">
            First name
          </label>
          <input
            id={firstId}
            name="firstName"
            type="text"
            placeholder="Alice"
            data-ai-intent="Customer first name"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>
        <div>
          <label htmlFor={lastId} className="mb-1 block text-sm font-medium text-gray-700">
            Last name
          </label>
          <input
            id={lastId}
            name="lastName"
            type="text"
            placeholder="Smith"
            data-ai-intent="Customer last name"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={emailId} className="mb-1 block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            placeholder="alice@example.com"
            data-ai-intent="Customer email address"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="col-span-3 mb-1 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Payment
        </legend>
        <div className="sm:col-span-2">
          <label htmlFor={cardId} className="mb-1 block text-sm font-medium text-gray-700">
            Card number
          </label>
          <input
            id={cardId}
            name="cardNumber"
            type="text"
            placeholder="4242 4242 4242 4242"
            data-ai-intent="16-digit credit card number"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>
        <div>
          <label htmlFor={expiryId} className="mb-1 block text-sm font-medium text-gray-700">
            Expiry
          </label>
          <input
            id={expiryId}
            name="expiry"
            type="text"
            placeholder="MM/YY"
            data-ai-intent="Card expiry date in MM/YY format"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>
        <div>
          <label htmlFor={cvvId} className="mb-1 block text-sm font-medium text-gray-700">
            CVV
          </label>
          <input
            id={cvvId}
            name="cvv"
            type="text"
            placeholder="123"
            data-ai-intent="3 or 4 digit card security code"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="col-span-2 mb-1 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Shipping
        </legend>
        <div className="sm:col-span-2">
          <label htmlFor={addressId} className="mb-1 block text-sm font-medium text-gray-700">
            Street address
          </label>
          <input
            id={addressId}
            name="address"
            type="text"
            placeholder="123 Main St"
            data-ai-intent="Street address including house number"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>
        <div>
          <label htmlFor={cityId} className="mb-1 block text-sm font-medium text-gray-700">
            City
          </label>
          <input
            id={cityId}
            name="city"
            type="text"
            placeholder="San Francisco"
            data-ai-intent="City name"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>
        <div>
          <label htmlFor={countryId} className="mb-1 block text-sm font-medium text-gray-700">
            Country
          </label>
          <select
            id={countryId}
            name="country"
            data-ai-intent="Country selection"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          >
            <option value="">Select…</option>
            <option value="US">United States</option>
            <option value="DE">Germany</option>
            <option value="GB">United Kingdom</option>
            <option value="FR">France</option>
            <option value="AU">Australia</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={notesId} className="mb-1 block text-sm font-medium text-gray-700">
            Delivery notes <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            id={notesId}
            name="notes"
            rows={3}
            placeholder="Leave at door, ring bell, etc."
            data-ai-intent="Special delivery instructions"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>
      </fieldset>

      <SubmitControl submitText="Place order" />
    </form>
  )
}

// ---------------------------------------------------------------------------
// AI Agent simulator panel (for demo purposes)
// ---------------------------------------------------------------------------

interface SimulatorPanelProps {
  partyKitHost: string
  roomId: string
}

function AISimulatorPanel({ partyKitHost, roomId }: SimulatorPanelProps) {
  const [hints, setHints] = useState<string>('')
  const [status, setStatus] = useState<string>('')

  async function loadHints() {
    try {
      const data = await getNormalBehavior({ data: '/demo' })
      setHints(JSON.stringify(data.fields, null, 2))
      setStatus('Hints loaded ✓')
    } catch (err) {
      setStatus(`Error: ${String(err)}`)
    }
  }

  function sendDraft(fieldId: string, value: string, reason: string) {
    // Connect as an AI Agent and push a DRAFT_FIELD message
    const wsProto = partyKitHost.startsWith('localhost') || partyKitHost.startsWith('127.')
      ? 'ws'
      : 'wss'
    const url = `${wsProto}://${partyKitHost}/parties/main/${encodeURIComponent(roomId)}?userId=ai-agent&name=AI%20Assistant&color=%238b5cf6`
    const ws = new WebSocket(url)
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'DRAFT_FIELD',
        fieldId,
        value,
        source: 'AI Assistant',
        reason,
      }))
      setTimeout(() => ws.close(), 300)
      setStatus(`Draft sent for "${fieldId}" ✓`)
    }
    ws.onerror = () => setStatus('WebSocket error – is partykit dev running?')
  }

  return (
    <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50 p-5">
      <h2 className="mb-3 font-semibold text-violet-900">🤖 AI Agent simulator</h2>
      <p className="mb-4 text-sm text-violet-700">
        Simulate an AI Agent by injecting draft suggestions into the room. The
        main form will show Accept / Reject bubbles.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          onClick={() => sendDraft('firstName', 'Alice', 'Common test first name')}
          className="rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
        >
          Draft: firstName → "Alice"
        </button>
        <button
          onClick={() => sendDraft('email', 'alice@example.com', 'Matches the first name')}
          className="rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
        >
          Draft: email → "alice@example.com"
        </button>
        <button
          onClick={() => sendDraft('city', 'San Francisco', 'Most common city in dataset')}
          className="rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
        >
          Draft: city → "San Francisco"
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={loadHints}
          className="rounded border border-violet-400 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100"
        >
          Load AI guardrails (server fn)
        </button>
        {status && <span className="text-xs text-violet-600">{status}</span>}
      </div>

      {hints && (
        <pre className="mt-3 max-h-40 overflow-auto rounded bg-white p-3 text-xs text-gray-700 border border-violet-200">
          {hints}
        </pre>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Demo page
// ---------------------------------------------------------------------------

function DemoPage() {
  const partyKitHost = import.meta.env.VITE_PARTYKIT_HOST as string ?? '127.0.0.1:1999'
  const roomId = 'room-demo'
  const [submitMode, setSubmitMode] = useState<'any' | 'consensus'>('any')

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6">
        <a href="/" className="text-sm text-violet-600 hover:underline">← Back</a>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Checkout form · live demo</h1>
        <p className="mt-1 text-sm text-gray-500">
          Open this page in two tabs to see ghost cursors and field sync.
          The green dot (top-right of the form) shows connection status.
        </p>

        {/* Submit mode toggle */}
        <div className="mt-4 flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Submit mode:</span>
          <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1">
            <button
              onClick={() => setSubmitMode('any')}
              className={`rounded px-3 py-1 text-sm font-semibold transition ${
                submitMode === 'any'
                  ? 'bg-violet-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Any
            </button>
            <button
              onClick={() => setSubmitMode('consensus')}
              className={`rounded px-3 py-1 text-sm font-semibold transition ${
                submitMode === 'consensus'
                  ? 'bg-violet-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Consensus
            </button>
          </div>
          <span className="text-xs text-gray-500">
            {submitMode === 'any'
              ? 'Any peer can submit'
              : 'All peers must mark ready'}
          </span>
        </div>
      </div>

      {/* The harness wraps the entire checkout form – zero changes inside */}
      <CollaborationHarness
        roomId={roomId}
        partyKitHost={partyKitHost}
        submitMode={submitMode}
      >
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <CheckoutForm />
        </div>
      </CollaborationHarness>

      <div className="mt-8">
        <AISimulatorPanel partyKitHost={partyKitHost} roomId={roomId} />
      </div>
    </div>
  )
}
