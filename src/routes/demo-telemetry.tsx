/**
 * /demo-telemetry – Checkout form with TELEMETRY ENABLED
 *
 * This route demonstrates the telemetry system:
 *   • Same features as /demo but with comprehensive event tracking
 *   • PII mode: 'capture' (stores raw values for testing)
 *   • Captures: field interactions, keystrokes, validation errors, AI drafts
 *   • Check database: `node scripts/verify-telemetry-db.js`
 *   • Query data: `sqlite3 data/telemetry.db`
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState, useId, useEffect, useRef, useCallback } from 'react'
import { CollaborationHarnessWithTelemetry } from '../components/CollaborationHarnessWithTelemetry'
import { useCollaboration } from '../components/CollaborationHarness'
import { SubmitControl } from '../components/SubmitControl'
import { UserSettingsPanel } from '../components/UserSettingsPanel'
import { FloatingCursorChat, type FloatingChatPosition } from '../components/FloatingCursorChat'
import { getNormalBehavior } from '../lib/normalBehavior.server'

export const Route = createFileRoute('/demo-telemetry')({
  component: DemoTelemetryPage,
})

// ---------------------------------------------------------------------------
// Simple checkout form (plain HTML – no special collaboration code needed)
// ---------------------------------------------------------------------------

function CheckoutForm({
  submitted,
  setSubmitted,
  onReset
}: {
  submitted: boolean
  setSubmitted: (submitted: boolean) => void
  onReset: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [formKey, setFormKey] = useState(0)
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

  // Client-only rendering to avoid hydration issues with browser extensions
  useEffect(() => {
    setMounted(true)
  }, [])

  function resetForm() {
    // Clear all form fields
    const formElements = document.querySelectorAll('form input, form textarea, form select')
    formElements.forEach((element) => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.value = ''
        // Dispatch events so CollaborationHarness picks up the change
        element.dispatchEvent(new Event('input', { bubbles: true }))
        element.dispatchEvent(new Event('change', { bubbles: true }))
      } else if (element instanceof HTMLSelectElement) {
        element.selectedIndex = 0
        element.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })

    // Clear form-related localStorage (preserve settings and cursor chat)
    if (typeof window !== 'undefined') {
      const preserveKeys = ['floatingChatPosition']
      const keysToRemove: string[] = []

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && !preserveKeys.includes(key)) {
          keysToRemove.push(key)
        }
      }

      keysToRemove.forEach((key) => localStorage.removeItem(key))
    }

    // Reset submitted state and mark that user has manually reset
    onReset()

    // Force re-render by changing key
    setFormKey((k) => k + 1)
  }

  if (!mounted) {
    return <div className="h-96" /> // Placeholder during SSR
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center sm:p-8">
        <div className="mb-2 text-4xl">✅</div>
        <h2 className="text-lg font-semibold text-green-800 sm:text-xl">Order placed!</h2>
        <p className="mt-2 text-sm text-green-700">
          📊 Telemetry data captured. Check: <code className="rounded bg-green-100 px-1 py-0.5 text-xs">node scripts/verify-telemetry-db.js</code>
        </p>
        <button
          className="mt-3 text-sm text-green-700 underline sm:mt-4"
          onClick={resetForm}
        >
          Reset form
        </button>
      </div>
    )
  }

  return (
    <form
      key={formKey}
      className="grid gap-4 sm:gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        setSubmitted(true)
      }}
    >
      <fieldset className="grid gap-3 sm:gap-4 sm:grid-cols-2">
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
            required
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
            required
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
            required
            data-ai-intent="Customer email address"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:gap-4 sm:grid-cols-3">
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
            pattern="[0-9\s]{13,19}"
            required
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
            pattern="(0[1-9]|1[0-2])\/([0-9]{2})"
            required
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
            pattern="[0-9]{3,4}"
            required
            data-ai-intent="3 or 4 digit card security code"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:gap-4 sm:grid-cols-2">
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
            required
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
            required
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
            required
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
  partyKitHost?: string
  roomId: string
}

function AISimulatorPanel({ partyKitHost, roomId }: SimulatorPanelProps) {
  const [hints, setHints] = useState<string>('')
  const [status, setStatus] = useState<string>('')

  async function loadHints() {
    try {
      const data = await getNormalBehavior({ data: '/demo-telemetry' })
      setHints(JSON.stringify(data.fields, null, 2))
      setStatus('Hints loaded ✓')
    } catch (err) {
      setStatus(`Error: ${String(err)}`)
    }
  }

  function sendDraft(fieldId: string, value: string, reason: string) {
    // Connect as an AI Agent and push a DRAFT_FIELD message
    const host = partyKitHost ?? window.location.host
    const wsProto = host.startsWith('localhost') || host.startsWith('127.')
      ? 'ws'
      : 'wss'
    const url = `${wsProto}://${host}/parties/main/${encodeURIComponent(roomId)}?userId=ai-agent&name=AI%20Assistant&color=%238b5cf6`
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
    ws.onerror = () => setStatus('WebSocket error – is server running?')
  }

  return (
    <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50 p-4 sm:p-5">
      <h2 className="mb-2 text-sm font-semibold text-violet-900 sm:mb-3 sm:text-base">🤖 AI Agent simulator</h2>
      <p className="mb-3 text-xs text-violet-700 sm:mb-4 sm:text-sm">
        Simulate an AI Agent by injecting draft suggestions into the room. The
        main form will show Accept / Reject bubbles. Telemetry tracks AI suggestion acceptance rates.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          onClick={() => sendDraft('firstName', 'Alice', 'Common test first name')}
          onTouchEnd={(e) => {
            e.preventDefault()
            sendDraft('firstName', 'Alice', 'Common test first name')
          }}
          className="rounded bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 active:bg-violet-800 touch-manipulation"
        >
          Draft: firstName → "Alice"
        </button>
        <button
          onClick={() => sendDraft('email', 'alice@example.com', 'Matches the first name')}
          onTouchEnd={(e) => {
            e.preventDefault()
            sendDraft('email', 'alice@example.com', 'Matches the first name')
          }}
          className="rounded bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 active:bg-violet-800 touch-manipulation"
        >
          Draft: email → "alice@example.com"
        </button>
        <button
          onClick={() => sendDraft('city', 'San Francisco', 'Most common city in dataset')}
          onTouchEnd={(e) => {
            e.preventDefault()
            sendDraft('city', 'San Francisco', 'Most common city in dataset')
          }}
          className="rounded bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 active:bg-violet-800 touch-manipulation"
        >
          Draft: city → "San Francisco"
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={loadHints}
          onTouchEnd={(e) => {
            e.preventDefault()
            loadHints()
          }}
          className="rounded border border-violet-400 bg-white px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100 active:bg-violet-200 touch-manipulation"
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
// Telemetry info panel
// ---------------------------------------------------------------------------

function TelemetryInfoPanel() {
  return (
    <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50 p-4 sm:p-5">
      <h2 className="mb-2 text-sm font-semibold text-emerald-900 sm:mb-3 sm:text-base">📊 Telemetry Active</h2>
      <p className="mb-3 text-xs text-emerald-700 sm:text-sm">
        This page captures comprehensive interaction data for analysis.
      </p>

      <div className="space-y-2 text-xs text-emerald-800">
        <div className="flex items-start gap-2">
          <span className="mt-0.5">✓</span>
          <span><strong>Events tracked:</strong> Field focus/blur, keystrokes, validation errors, AI drafts</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="mt-0.5">✓</span>
          <span><strong>PII mode:</strong> <code className="rounded bg-emerald-100 px-1 py-0.5">capture</code> (raw values stored for testing)</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="mt-0.5">✓</span>
          <span><strong>Storage:</strong> SQLite database at <code className="rounded bg-emerald-100 px-1 py-0.5">./data/telemetry.db</code></span>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-white p-3 border border-emerald-200">
        <div className="mb-2 text-xs font-semibold text-emerald-900">Verify Data Capture</div>
        <code className="block text-xs text-gray-700 bg-gray-50 p-2 rounded overflow-x-auto">
          node scripts/verify-telemetry-db.js
        </code>
      </div>

      <div className="mt-3 rounded-lg bg-white p-3 border border-emerald-200">
        <div className="mb-2 text-xs font-semibold text-emerald-900">Query Events</div>
        <code className="block text-xs text-gray-700 bg-gray-50 p-2 rounded overflow-x-auto">
          sqlite3 data/telemetry.db "SELECT event_type, COUNT(*) FROM telemetry_interactions GROUP BY event_type;"
        </code>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings panel wrapper that uses the collab context
// ---------------------------------------------------------------------------

function SettingsPanelWrapper({
  isOpen,
  onClose,
  floatingChatPosition,
  setFloatingChatPosition,
}: {
  isOpen: boolean
  onClose: () => void
  floatingChatPosition: FloatingChatPosition
  setFloatingChatPosition: (position: FloatingChatPosition) => void
}) {
  const { userName, userColor, cursorMessage, updateUser, setCursorMessage } = useCollaboration()
  return (
    <UserSettingsPanel
      isOpen={isOpen}
      onClose={onClose}
      userName={userName}
      userColor={userColor}
      cursorMessage={cursorMessage}
      floatingChatPosition={floatingChatPosition}
      updateUser={updateUser}
      setCursorMessage={setCursorMessage}
      setFloatingChatPosition={setFloatingChatPosition}
    />
  )
}

// ---------------------------------------------------------------------------
// Demo page
// ---------------------------------------------------------------------------

function DemoTelemetryPage() {
  const partyKitHost = import.meta.env.VITE_PARTYKIT_HOST as string | undefined
  const roomId = 'room-demo-telemetry'
  const [submitMode, setSubmitMode] = useState<'any' | 'consensus'>('consensus')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const hasResetRef = useRef(false)

  // Handler to mark that user has manually reset the form
  const handleReset = useCallback(() => {
    hasResetRef.current = true
    setSubmitted(false)
  }, [])

  // Load floating chat position from localStorage, default to bottom-left
  const [floatingChatPosition, setFloatingChatPositionState] = useState<FloatingChatPosition>(() => {
    if (typeof window === 'undefined') return 'bottom-left'
    const saved = localStorage.getItem('floatingChatPosition')
    return (saved as FloatingChatPosition) || 'bottom-left'
  })

  // Persist position to localStorage
  const setFloatingChatPosition = (position: FloatingChatPosition) => {
    setFloatingChatPositionState(position)
    if (typeof window !== 'undefined') {
      localStorage.setItem('floatingChatPosition', position)
    }
  }

  return (
    <CollaborationHarnessWithTelemetry
      roomId={roomId}
      partyKitHost={partyKitHost}
      submitMode={submitMode}
      onFormSubmit={() => {
        // Don't set submitted if user has manually reset the form
        if (!hasResetRef.current) {
          setSubmitted(true)
        }
      }}
      telemetryConfig={{
        enabled: true,
        piiMode: 'capture', // Store raw values for testing
        sampleRate: 1.0,
        captureKeystrokes: true,
        captureCursors: false,
      }}
    >
      <DemoPageContent
        submitMode={submitMode}
        setSubmitMode={setSubmitMode}
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        partyKitHost={partyKitHost}
        roomId={roomId}
        submitted={submitted}
        setSubmitted={setSubmitted}
        onReset={handleReset}
        floatingChatPosition={floatingChatPosition}
        setFloatingChatPosition={setFloatingChatPosition}
      />
    </CollaborationHarnessWithTelemetry>
  )
}

function DemoPageContent({
  submitMode,
  setSubmitMode,
  settingsOpen,
  setSettingsOpen,
  partyKitHost,
  roomId,
  submitted,
  setSubmitted,
  onReset,
  floatingChatPosition,
  setFloatingChatPosition,
}: {
  submitMode: 'any' | 'consensus'
  setSubmitMode: (mode: 'any' | 'consensus') => void
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  partyKitHost: string | undefined
  roomId: string
  submitted: boolean
  setSubmitted: (submitted: boolean) => void
  onReset: () => void
  floatingChatPosition: FloatingChatPosition
  setFloatingChatPosition: (position: FloatingChatPosition) => void
}) {
  return (
    <div className="mx-auto max-w-2xl px-3 py-6 sm:px-4 sm:py-10">
      <div className="mb-4 sm:mb-6">
        <a href="/" className="text-sm text-violet-600 hover:underline">← Back</a>
        <h1 className="mt-2 text-xl font-bold text-gray-900 sm:text-2xl">
          Checkout form · telemetry demo
        </h1>
        <p className="mt-1 text-xs text-gray-500 sm:text-sm">
          Same as /demo but with comprehensive telemetry tracking enabled.
          All interactions are captured for analysis.
        </p>

        {/* Submit mode toggle */}
        <div className="mt-3 flex flex-col gap-2 sm:mt-4 sm:flex-row sm:items-center sm:gap-3">
          <span className="text-xs font-medium text-gray-700 sm:text-sm">Submit mode:</span>
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

      {/* The checkout form wrapped with collaboration + telemetry */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:rounded-2xl sm:p-8">
        <CheckoutForm submitted={submitted} setSubmitted={setSubmitted} onReset={onReset} />
      </div>

      {/* User settings panel (inside harness to access context) */}
      <SettingsPanelWrapper
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        floatingChatPosition={floatingChatPosition}
        setFloatingChatPosition={setFloatingChatPosition}
      />

      {/* Floating cursor chat controls */}
      <FloatingCursorChat
        position={floatingChatPosition}
        onSettingsClick={() => setSettingsOpen(true)}
      />

      <div className="mt-6 space-y-6 sm:mt-8">
        <TelemetryInfoPanel />
        <AISimulatorPanel partyKitHost={partyKitHost} roomId={roomId} />
      </div>
    </div>
  )
}
