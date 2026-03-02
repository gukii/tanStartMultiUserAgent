# Collaboration Harness Guide

A drop-in real-time collaboration system for TanStack Start forms. Add multi-user editing, ghost cursors, field locking, and consensus submission to any form in 3 lines of code.

## Table of Contents

- [Quick Start](#quick-start)
- [Using Layout Routes](#using-layout-routes)
- [Room Strategies](#room-strategies)
- [Complete Examples](#complete-examples)
- [Optional Features](#optional-features)
- [API Reference](#api-reference)

---

## Quick Start

### Add Collaboration to a Single Route

```tsx
// src/routes/order-form.tsx
import { CollaborationHarness } from '~/components/CollaborationHarness'
import { FloatingCursorChat } from '~/components/FloatingCursorChat'

export default function OrderFormPage() {
  return (
    <CollaborationHarness roomId="order-form">
      {/* Your existing form - no changes needed */}
      <form>
        <input name="customerName" placeholder="Name" />
        <input name="email" placeholder="Email" />
        <button type="submit">Submit</button>
      </form>

      <FloatingCursorChat position="bottom-right" onSettingsClick={() => {}} />
    </CollaborationHarness>
  )
}
```

**That's it!** Your form now has:
- ✅ Real-time field synchronization
- ✅ Ghost cursors showing other users
- ✅ Field locking (colored borders when others are typing)
- ✅ Auto-discovery of all form fields
- ✅ No changes to your existing form code

---

## Using Layout Routes

TanStack Start uses underscore-prefixed routes (`_layout.tsx`) for shared layouts. This is perfect for wrapping multiple routes with collaboration.

### Pattern 1: Wrap All Child Routes with Collaboration

```tsx
// src/routes/_collab.tsx
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { CollaborationHarness } from '~/components/CollaborationHarness'
import { FloatingCursorChat } from '~/components/FloatingCursorChat'
import { UserSettingsPanel } from '~/components/UserSettingsPanel'
import { useState } from 'react'

export const Route = createFileRoute('/_collab')({
  component: CollabLayout,
})

function CollabLayout() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [floatingChatPosition, setFloatingChatPosition] = useState('bottom-right')

  // Use pathname as roomId so each route gets its own room
  const roomId = typeof window !== 'undefined'
    ? window.location.pathname
    : 'default'

  return (
    <CollaborationHarness roomId={roomId}>
      {/* All child routes render here */}
      <Outlet />

      {/* Shared collaboration UI */}
      <FloatingCursorChat
        position={floatingChatPosition}
        onSettingsClick={() => setSettingsOpen(true)}
      />

      <SettingsPanelWrapper
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        floatingChatPosition={floatingChatPosition}
        setFloatingChatPosition={setFloatingChatPosition}
      />
    </CollaborationHarness>
  )
}
```

### Child Routes (Automatically Collaborative)

```tsx
// src/routes/_collab.order-form.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_collab/order-form')({
  component: OrderForm,
})

function OrderForm() {
  // No CollaborationHarness needed - inherited from layout
  return (
    <div className="container">
      <h1>Order Form</h1>
      <form>
        <input name="customerName" placeholder="Customer Name" />
        <input name="email" placeholder="Email" />
        <textarea name="notes" placeholder="Special instructions" />
        <button type="submit">Submit Order</button>
      </form>
    </div>
  )
}
```

```tsx
// src/routes/_collab.checkout.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_collab/checkout')({
  component: Checkout,
})

function Checkout() {
  // No CollaborationHarness needed - inherited from layout
  return (
    <div className="container">
      <h1>Checkout</h1>
      <form>
        <input name="cardNumber" placeholder="Card Number" />
        <input name="expiry" placeholder="MM/YY" />
        <input name="cvv" placeholder="CVV" />
        <button type="submit">Pay Now</button>
      </form>
    </div>
  )
}
```

**File Structure:**
```
src/routes/
  _collab.tsx              ← Layout with CollaborationHarness
  _collab.order-form.tsx   ← Auto-collaborative
  _collab.checkout.tsx     ← Auto-collaborative
  _collab.settings.tsx     ← Auto-collaborative
  about.tsx                ← Not collaborative (outside _collab)
```

---

## Room Strategies

### Strategy 1: Pathname-Based (Automatic)

Each route gets its own room automatically.

```tsx
// _collab.tsx
const roomId = window.location.pathname // e.g., "/order-form"
<CollaborationHarness roomId={roomId}>
```

**Result:**
- `/order-form` → room: "/order-form"
- `/checkout` → room: "/checkout"
- Users on the same route collaborate together

### Strategy 2: Entity-Based (Most Common)

Users collaborate on specific entities (orders, documents, applications).

```tsx
// src/routes/_collab.orders.$orderId.edit.tsx
import { createFileRoute } from '@tanstack/react-router'
import { CollaborationHarness } from '~/components/CollaborationHarness'

export const Route = createFileRoute('/_collab/orders/$orderId/edit')({
  component: EditOrder,
})

function EditOrder() {
  const { orderId } = Route.useParams()

  return (
    <CollaborationHarness roomId={`order-${orderId}`}>
      <form>
        <input name="customerName" />
        <input name="shippingAddress" />
        <button type="submit">Save Order</button>
      </form>
    </CollaborationHarness>
  )
}
```

**Result:**
- `/orders/123/edit` → room: "order-123"
- `/orders/456/edit` → room: "order-456"
- Multiple users editing order 123 collaborate in the same room

### Strategy 3: Hybrid (Layout + Override)

Use layout for default behavior, override in specific routes.

```tsx
// _collab.tsx (default: pathname-based)
<CollaborationHarness roomId={window.location.pathname}>
  <Outlet />
</CollaborationHarness>

// _collab.orders.$orderId.edit.tsx (override: entity-based)
function EditOrder() {
  const { orderId } = Route.useParams()

  // This replaces the layout's harness for this specific route
  return (
    <CollaborationHarness roomId={`order-${orderId}`}>
      <form>...</form>
    </CollaborationHarness>
  )
}
```

---

## Complete Examples

### Example 1: Invoice Editor with Consensus Submit

```tsx
// src/routes/_collab.invoices.$invoiceId.edit.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { SubmitControl } from '~/components/SubmitControl'

export const Route = createFileRoute('/_collab/invoices/$invoiceId/edit')({
  component: EditInvoice,
})

function EditInvoice() {
  const { invoiceId } = Route.useParams()
  const [submitted, setSubmitted] = useState(false)

  if (submitted) {
    return <div>✅ Invoice saved successfully!</div>
  }

  return (
    <div className="container mx-auto p-8">
      <h1>Edit Invoice #{invoiceId}</h1>

      <form>
        {/* Line items */}
        <fieldset>
          <legend>Line Items</legend>
          <input name="item1" placeholder="Item 1" />
          <input name="price1" type="number" placeholder="Price" />

          <input name="item2" placeholder="Item 2" />
          <input name="price2" type="number" placeholder="Price" />
        </fieldset>

        {/* Customer info */}
        <fieldset>
          <legend>Customer Information</legend>
          <input name="customerName" placeholder="Customer Name" />
          <input name="customerEmail" placeholder="Email" />
          <textarea name="billingAddress" placeholder="Billing Address" />
        </fieldset>

        {/* Terms */}
        <fieldset>
          <legend>Payment Terms</legend>
          <select name="paymentTerms">
            <option value="net30">Net 30</option>
            <option value="net60">Net 60</option>
            <option value="due-on-receipt">Due on Receipt</option>
          </select>
        </fieldset>

        {/* Smart submit button with consensus */}
        <SubmitControl
          submitText="Save Invoice"
          onSubmit={() => {
            // Handle form submission
            console.log('Submitting invoice...')
            setSubmitted(true)
          }}
        />
      </form>
    </div>
  )
}
```

**What you get:**
- All users editing invoice 123 see each other's cursors
- Field locking prevents conflicts
- In consensus mode: all users must mark "ready" before submit
- Auto-submit when everyone is ready

### Example 2: Multi-Step Form with Collaboration

```tsx
// src/routes/_collab.application.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { CollaborationHarness, useCollaboration } from '~/components/CollaborationHarness'
import { SubmitControl } from '~/components/SubmitControl'

export const Route = createFileRoute('/_collab/application')({
  component: ApplicationForm,
})

function ApplicationForm() {
  const [step, setStep] = useState(1)
  const applicationId = 'app-12345' // In real app, get from URL or generate

  return (
    <CollaborationHarness
      roomId={`application-${applicationId}`}
      submitMode="consensus"
    >
      <div className="container mx-auto p-8">
        <h1>Job Application</h1>

        <div className="mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setStep(1)}
              className={step === 1 ? 'font-bold' : ''}
            >
              1. Personal Info
            </button>
            <button
              onClick={() => setStep(2)}
              className={step === 2 ? 'font-bold' : ''}
            >
              2. Experience
            </button>
            <button
              onClick={() => setStep(3)}
              className={step === 3 ? 'font-bold' : ''}
            >
              3. Review
            </button>
          </div>
        </div>

        <form>
          {step === 1 && (
            <fieldset>
              <legend>Personal Information</legend>
              <input name="firstName" placeholder="First Name" />
              <input name="lastName" placeholder="Last Name" />
              <input name="email" type="email" placeholder="Email" />
              <input name="phone" placeholder="Phone" />
            </fieldset>
          )}

          {step === 2 && (
            <fieldset>
              <legend>Experience</legend>
              <textarea name="previousRole" placeholder="Previous Role" />
              <textarea name="skills" placeholder="Key Skills" />
              <input name="yearsExperience" type="number" placeholder="Years of Experience" />
            </fieldset>
          )}

          {step === 3 && (
            <div>
              <h2>Review & Submit</h2>
              <p>All team members must mark ready to submit.</p>
              <SubmitControl submitText="Submit Application" />
            </div>
          )}

          {step < 3 && (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
            >
              Next
            </button>
          )}
        </form>
      </div>
    </CollaborationHarness>
  )
}
```

### Example 3: Admin Dashboard with Selective Collaboration

```tsx
// src/routes/_collab.admin.settings.tsx
import { createFileRoute } from '@tanstack/react-router'
import { CollaborationHarness } from '~/components/CollaborationHarness'

export const Route = createFileRoute('/_collab/admin/settings')({
  component: AdminSettings,
})

function AdminSettings() {
  const user = useCurrentUser() // Your auth hook
  const isCollaborativeSession = user.role === 'admin' // Only admins collaborate

  return (
    <CollaborationHarness
      roomId="admin-settings"
      disabled={!isCollaborativeSession} // Regular users don't see collaboration features
    >
      <div className="container">
        <h1>System Settings</h1>

        <form>
          <section>
            <h2>Email Settings</h2>
            <input name="smtpHost" placeholder="SMTP Host" />
            <input name="smtpPort" placeholder="SMTP Port" />
            <input name="fromEmail" placeholder="From Email" />
          </section>

          <section>
            <h2>Security</h2>
            <label>
              <input type="checkbox" name="require2FA" />
              Require 2FA for all users
            </label>
            <label>
              <input type="checkbox" name="enforceStrongPasswords" />
              Enforce strong passwords
            </label>
          </section>

          <button type="submit">Save Settings</button>
        </form>
      </div>
    </CollaborationHarness>
  )
}
```

---

## Optional Features

### Consensus Mode

Require all users to mark "ready" before form submission.

```tsx
<CollaborationHarness
  roomId="important-form"
  submitMode="consensus" // default is "any"
>
  <form>
    {/* ... */}
    <SubmitControl submitText="Submit" />
  </form>
</CollaborationHarness>
```

### Callbacks

React to collaboration events in your application.

```tsx
<CollaborationHarness
  roomId="my-form"
  onFieldUpdate={(fieldId, value, userId) => {
    console.log(`${userId} updated ${fieldId} to ${value}`)
    // Update analytics, trigger validations, etc.
  }}
  onSchemaUpdate={(schema) => {
    console.log('Form fields detected:', schema)
  }}
  onFormSubmit={(submittedByUserId) => {
    console.log(`Form submitted by ${submittedByUserId}`)
    // Navigate to success page, show toast, etc.
  }}
>
```

### Custom User Identity

Provide pre-determined user names and colors instead of random ones.

```tsx
function MyForm() {
  const currentUser = useAuth() // Your auth hook

  return (
    <CollaborationHarness
      roomId="my-form"
      userName={currentUser.name} // e.g., "Alice Johnson"
      userColor={currentUser.avatarColor} // e.g., "#3b82f6"
    >
      <form>...</form>
    </CollaborationHarness>
  )
}
```

### AI Draft Suggestions

Programmatically suggest values for fields (e.g., from an AI assistant).

```tsx
function FormWithAI() {
  const { draftField } = useCollaboration()

  async function fillWithAI() {
    const suggestions = await fetchAISuggestions()

    // Suggest values for fields
    draftField('customerName', suggestions.name, 'AI Assistant',
      'Based on previous orders')
    draftField('email', suggestions.email, 'AI Assistant')
  }

  return (
    <form>
      <input name="customerName" />
      <input name="email" />
      <button type="button" onClick={fillWithAI}>
        Fill with AI
      </button>
    </form>
  )
}
```

Users see suggestion bubbles and can accept/reject them.

---

## API Reference

### `<CollaborationHarness>`

Main wrapper component that enables real-time collaboration.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `roomId` | `string` | `pathname` | Unique room identifier. Users in the same room collaborate together. |
| `userName` | `string` | Random | Display name for this user (e.g., "Alice Smith") |
| `userColor` | `string` | Random | Hex color for this user's cursor (e.g., "#3b82f6") |
| `submitMode` | `'any' \| 'consensus'` | `'any'` | Submit mode: 'any' allows any peer to submit, 'consensus' requires all peers to mark ready |
| `disabled` | `boolean` | `false` | Set true to disable collaboration features |
| `onFieldUpdate` | `(fieldId, value, userId) => void` | - | Called when any peer updates a field |
| `onSchemaUpdate` | `(schema) => void` | - | Called when form fields are detected |
| `onFormSubmit` | `(userId) => void` | - | Called when any peer submits the form |
| `children` | `ReactNode` | - | Your form and content |

### `<FloatingCursorChat>`

Floating UI controls for cursor messages and settings.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `position` | `'top-left' \| 'top-right' \| 'bottom-left' \| 'bottom-right'` | `'bottom-right'` | Corner position |
| `onSettingsClick` | `() => void` | - | Callback when settings gear icon is clicked |

### `<SubmitControl>`

Smart submit button that handles consensus mode.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSubmit` | `() => void` | - | Called when form should submit |
| `submitText` | `string` | `'Submit'` | Button text in 'any' mode |
| `className` | `string` | - | Additional CSS classes |

### `useCollaboration()` Hook

Access collaboration context within a `CollaborationHarness`.

```tsx
const {
  connected,          // boolean: WebSocket connection status
  userId,             // string: Current user's ID
  userName,           // string: Current user's name
  userColor,          // string: Current user's color
  users,              // Record<userId, UserInfo>: All users in room
  submitMode,         // 'any' | 'consensus'
  readyStates,        // Record<userId, boolean>: Ready states
  fieldLocks,         // Record<fieldId, userId>: Active field locks
  cursorMessage,      // string: Current cursor message

  updateUser,         // (name, color) => void
  setCursorMessage,   // (message) => void
  markReady,          // () => void
  unmarkReady,        // () => void
  draftField,         // (fieldId, value, source, reason?) => void
  sendFormSubmit,     // () => void
} = useCollaboration()
```

---

## Performance & Best Practices

### Do's ✅

- **One harness per page** - Wrap at the route/layout level
- **Use entity-based room IDs** - `order-${orderId}` not `form-${userId}`
- **Store position preferences** - Use localStorage for `floatingChatPosition`
- **Clean room IDs** - Keep them short and meaningful

### Don'ts ❌

- **Don't nest harnesses** - Only one harness per component tree
- **Don't use user IDs as room IDs** - This isolates users instead of connecting them
- **Don't wrap tiny components** - Wrap the full page/form, not individual inputs
- **Don't forget SSR safety** - Check `typeof window !== 'undefined'` when using browser APIs

### Server Considerations

The current server implementation (`server/integrated-server.ts`) stores room state in memory. For production:

- **Add persistence**: Use Redis or database for room state
- **Add room TTL**: Clean up inactive rooms after N hours
- **Add rate limiting**: Prevent abuse of WebSocket connections
- **Add authentication**: Verify user identity before joining rooms

---

## Troubleshooting

### Collaboration not working?

1. **Check WebSocket connection**: Look for green connection dot (top-right of form)
2. **Verify room ID**: Open console and check `useCollaboration().roomId`
3. **Check server logs**: Look for WebSocket connection messages
4. **Try different browsers**: Open 2 tabs/windows to test

### Fields not syncing?

1. **Ensure fields have IDs or names**: `<input name="email">` or `<input id="email">`
2. **Check if fields are inside harness**: Fields outside `<CollaborationHarness>` won't sync
3. **Look for console errors**: Check browser console for errors

### Cursors not showing?

1. **Open in 2 separate tabs**: You can't see your own cursor
2. **Check if both users are in same room**: Verify room IDs match
3. **Move your mouse**: Cursors update on mouse movement

---

## Examples in This Repo

- **`/demo`** - Full-featured demo with all collaboration features
- **`src/components/CollaborationHarness.tsx`** - Main harness implementation
- **`src/components/FloatingCursorChat.tsx`** - Floating UI controls
- **`src/components/SubmitControl.tsx`** - Smart submit button
- **`server/integrated-server.ts`** - WebSocket server handling

---

## License

MIT
