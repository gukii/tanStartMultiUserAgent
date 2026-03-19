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
import { submitCheckout } from '../lib/submitCheckout.server'
import { faker } from '@faker-js/faker'

interface ValidationError {
  field: string
  message: string
}

export const Route = createFileRoute('/demo-telemetry')({
  component: DemoTelemetryPage,
})

// ---------------------------------------------------------------------------
// Simple checkout form (plain HTML – no special collaboration code needed)
// ---------------------------------------------------------------------------

function CheckoutForm({
  submitted,
  setSubmitted,
  onReset,
  submittedBy,
  setSubmittedBy,
}: {
  submitted: boolean
  setSubmitted: (submitted: boolean) => void
  onReset: () => void
  submittedBy: string | null
  setSubmittedBy: (userId: string | null) => void
}) {
  const [mounted, setMounted] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const { unmarkReady, clearForm, sendFormSubmit, userId, users, broadcastServerErrors } = useCollaboration()
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
    // First, show the form (switch from success message to form)
    onReset()
    setSubmittedBy(null)
    unmarkReady()

    // Then, after form is mounted, clear all fields
    setTimeout(() => {
      clearForm()
    }, 50)
  }

  if (!mounted) {
    return <div className="h-96" /> // Placeholder during SSR
  }

  if (submitted) {
    const submittedByUser = submittedBy ? users[submittedBy] : null
    const submitterName = submittedByUser?.name || (submittedBy === userId ? 'You' : 'Someone')

    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center sm:p-8">
        <div className="mb-2 text-4xl">✅</div>
        <h2 className="text-lg font-semibold text-green-800 sm:text-xl">Order placed!</h2>
        {submittedBy && (
          <p className="mt-2 text-sm text-green-700">
            Submitted by: {submittedBy === userId ? 'You' : submitterName}
          </p>
        )}
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
      onSubmit={async (e) => {
        // Note: By the time onSubmit fires, the browser has already run HTML5 validation
        // If there were any invalid fields, the browser would have:
        // 1. Fired 'invalid' events on those fields (CollaborationHarness captures these)
        // 2. Shown error messages (via CollaborationHarness' ValidationErrorNotification)
        // 3. Blocked this submit event from firing
        // So if we reach here, the form is guaranteed to be valid (client-side).

        // Prevent default form submission (we handle it with server function)
        e.preventDefault()

        const formData = new FormData(e.currentTarget)
        setSubmitting(true)

        try {
          // Convert FormData to typed object for server function
          const data = {
            firstName: formData.get('firstName') as string,
            lastName: formData.get('lastName') as string,
            email: formData.get('email') as string,
            cardNumber: formData.get('cardNumber') as string,
            expiry: formData.get('expiry') as string,
            cvv: formData.get('cvv') as string,
            address: formData.get('address') as string,
            city: formData.get('city') as string,
            country: formData.get('country') as string,
            notes: formData.get('notes') as string || undefined,
          }

          // Call server function directly (type-safe, automatic serialization)
          const result = await submitCheckout({ data })

          console.log('[CheckoutForm] Server response:', result)

          if (result.success) {
            // Success - clear any previous errors and proceed with submission
            broadcastServerErrors([]) // Clear errors for all peers
            sendFormSubmit()
            setSubmitted(true)
            setSubmittedBy(userId)
            console.log('[CheckoutForm] Order placed successfully:', result.orderId)
          } else {
            // Server validation failed
            console.log('[CheckoutForm] Server validation failed, broadcasting errors:', result.errors)
            const errors = result.errors || []
            // Broadcast errors to all peers so everyone sees the validation feedback
            broadcastServerErrors(errors)
            console.log('[CheckoutForm] Errors broadcast to peers via harness')
          }
        } catch (error) {
          console.error('[CheckoutForm] Submission error:', error)
          // Show generic error without targeting specific field
          broadcastServerErrors([{
            field: '_form',
            message: 'Network error. Please check your connection and try again.'
          }])
        } finally {
          setSubmitting(false)
        }
      }}
    >
      <fieldset className="grid gap-3 sm:gap-4 sm:grid-cols-2">
        <legend className="col-span-2 mb-1 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Personal details
        </legend>
        <div>
          <label htmlFor={firstId} className="mb-1 block text-sm font-medium text-gray-700">
            First name <span className="text-red-500">*</span>
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
            Last name <span className="text-red-500">*</span>
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
            Email <span className="text-red-500">*</span>
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
            Card number <span className="text-red-500">*</span>
          </label>
          <input
            id={cardId}
            name="cardNumber"
            type="text"
            placeholder="4242 4242 4242 4242"
            pattern="[\d\s]{13,19}"
            required
            data-ai-intent="16-digit credit card number"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>
        <div>
          <label htmlFor={expiryId} className="mb-1 block text-sm font-medium text-gray-700">
            Expiry <span className="text-red-500">*</span>
          </label>
          <input
            id={expiryId}
            name="expiry"
            type="text"
            placeholder="MM/YY"
            pattern="\d{2}/\d{2}"
            required
            data-ai-intent="Card expiry date in MM/YY format"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
        </div>
        <div>
          <label htmlFor={cvvId} className="mb-1 block text-sm font-medium text-gray-700">
            CVV <span className="text-red-500">*</span>
          </label>
          <input
            id={cvvId}
            name="cvv"
            type="text"
            placeholder="123"
            pattern="\d{3,4}"
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
            Street address <span className="text-red-500">*</span>
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
            City <span className="text-red-500">*</span>
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
            Country <span className="text-red-500">*</span>
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

  function fillAllFields() {
    // Generate realistic faker data for all fields
    // Generate valid future expiry date
    const currentDate = new Date()
    const currentYear = currentDate.getFullYear() % 100 // Last 2 digits
    const currentMonth = currentDate.getMonth() + 1

    // Generate a date 1-3 years in the future
    const yearsAhead = faker.number.int({ min: 1, max: 3 })
    const futureYear = (currentYear + yearsAhead) % 100
    const expiryMonth = faker.number.int({ min: 1, max: 12 }).toString().padStart(2, '0')
    const expiryYear = futureYear.toString().padStart(2, '0')

    const countries = ['US', 'DE', 'GB', 'FR', 'AU']

    // Use test card numbers that are guaranteed to pass Luhn validation
    const validTestCards = [
      '4242 4242 4242 4242', // Visa
      '5555 5555 5555 4444', // Mastercard
      '3782 822463 10005',   // American Express
      '6011 1111 1111 1117', // Discover
    ]

    const formData = {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      email: faker.internet.email(),
      cardNumber: faker.helpers.arrayElement(validTestCards),
      expiry: `${expiryMonth}/${expiryYear}`,
      cvv: faker.string.numeric(3),
      address: faker.location.streetAddress(),
      city: faker.location.city(),
      country: faker.helpers.arrayElement(countries),
      notes: faker.lorem.sentence(),
    }

    // Connect as AI Agent and send UPDATE_FIELD for each field
    const host = partyKitHost ?? window.location.host
    const wsProto = host.startsWith('localhost') || host.startsWith('127.')
      ? 'ws'
      : 'wss'
    const url = `${wsProto}://${host}/parties/main/${encodeURIComponent(roomId)}?userId=ai-agent&name=AI%20Agent&color=%238b5cf6`
    const ws = new WebSocket(url)

    ws.onopen = () => {
      // Send UPDATE_FIELD for each field
      Object.entries(formData).forEach(([fieldId, value]) => {
        ws.send(JSON.stringify({
          type: 'UPDATE_FIELD',
          fieldId,
          value,
          timestamp: Date.now(),
        }))
      })
      setTimeout(() => ws.close(), 500)
      setStatus('✓ All fields filled with AI Agent data')
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
          onClick={fillAllFields}
          onTouchEnd={(e) => {
            e.preventDefault()
            fillAllFields()
          }}
          className="rounded bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 active:bg-emerald-800 touch-manipulation"
        >
          🤖 Fill All Fields (AI Agent)
        </button>
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
  submitMode,
  setSubmitMode,
}: {
  isOpen: boolean
  onClose: () => void
  floatingChatPosition: FloatingChatPosition
  setFloatingChatPosition: (position: FloatingChatPosition) => void
  submitMode: 'any' | 'consensus'
  setSubmitMode: (mode: 'any' | 'consensus') => void
}) {
  const { userName, userColor, updateUser } = useCollaboration()
  return (
    <UserSettingsPanel
      isOpen={isOpen}
      onClose={onClose}
      userName={userName}
      userColor={userColor}
      floatingChatPosition={floatingChatPosition}
      submitMode={submitMode}
      updateUser={updateUser}
      setFloatingChatPosition={setFloatingChatPosition}
      setSubmitMode={setSubmitMode}
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
  const [submittedBy, setSubmittedBy] = useState<string | null>(null)
  const hasResetRef = useRef(false)

  // Handler to mark that user has manually reset the form
  const handleReset = useCallback(() => {
    hasResetRef.current = true
    setSubmitted(false)
    setSubmittedBy(null)
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
      onFormSubmit={(submittedByUserId) => {
        // Don't set submitted if user has manually reset the form
        if (!hasResetRef.current) {
          setSubmitted(true)
          setSubmittedBy(submittedByUserId)
        }
      }}
      onFormClear={() => {
        // When any peer clears the form, reset our local state
        console.log('[Demo Telemetry] Form cleared by a peer - resetting local state')
        setSubmitted(false)
        setSubmittedBy(null)
        hasResetRef.current = false
      }}
      onSubmitModeChange={(mode) => {
        // When any peer changes submit mode, sync it locally
        console.log('[Demo Telemetry] Submit mode changed by a peer to:', mode)
        setSubmitMode(mode)
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
        submittedBy={submittedBy}
        setSubmittedBy={setSubmittedBy}
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
  submittedBy,
  setSubmittedBy,
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
  submittedBy: string | null
  setSubmittedBy: (userId: string | null) => void
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
      </div>

      {/* The checkout form wrapped with collaboration + telemetry */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:rounded-2xl sm:p-8">
        <CheckoutForm
          submitted={submitted}
          setSubmitted={setSubmitted}
          submittedBy={submittedBy}
          setSubmittedBy={setSubmittedBy}
          onReset={onReset}
        />
      </div>

      {/* User settings panel (inside harness to access context) */}
      <SettingsPanelWrapper
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        floatingChatPosition={floatingChatPosition}
        setFloatingChatPosition={setFloatingChatPosition}
        submitMode={submitMode}
        setSubmitMode={setSubmitMode}
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
