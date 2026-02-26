# Universal Collaboration Harness Usage

This guide shows how to use the `CollaborationHarness` in different patterns for maximum flexibility.

## Pattern 1: Layout Route (Recommended for Multiple Forms)

Use TanStack Start layout routes (`_` prefix) to wrap multiple routes:

### 1. Create Layout Route

`src/routes/_collab.tsx`:

```tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { CollaborationHarness } from '../components/CollaborationHarness'

export const Route = createFileRoute('/_collab')({
  component: CollabLayout,
})

function CollabLayout() {
  // Auto-generate roomId from pathname
  const roomId = typeof window !== 'undefined'
    ? window.location.pathname.replace(/\//g, '-')
    : 'default'

  return (
    <CollaborationHarness
      roomId={roomId}
      partyKitHost={import.meta.env.VITE_PARTYKIT_HOST}
    >
      <Outlet />
    </CollaborationHarness>
  )
}
```

### 2. Create Child Routes

Any route inside `_collab` gets collaboration automatically:

**`src/routes/_collab/form-1.tsx`**:
```tsx
export const Route = createFileRoute('/_collab/form-1')({
  component: Form1,
})

function Form1() {
  // Just build your form - collaboration is automatic!
  return <form>...</form>
}
```

**`src/routes/_collab/form-2.tsx`**:
```tsx
export const Route = createFileRoute('/_collab/form-2')({
  component: Form2,
})

function Form2() {
  return <form>...</form>
}
```

**Benefits**:
- ✅ No need to wrap each form individually
- ✅ Automatic room separation by route
- ✅ Clean, maintainable structure
- ✅ Easy to add/remove collaboration from routes

## Pattern 2: Per-Route Wrapping (For Selective Collaboration)

Wrap only specific routes that need collaboration:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { CollaborationHarness } from '../components/CollaborationHarness'

export const Route = createFileRoute('/checkout')({
  component: CheckoutPage,
})

function CheckoutPage() {
  return (
    <CollaborationHarness roomId="checkout-form">
      <CheckoutForm />
    </CollaborationHarness>
  )
}
```

**Benefits**:
- ✅ Fine-grained control over which forms are collaborative
- ✅ Can have different settings per form
- ✅ Explicit and clear

## Pattern 3: Component-Level Wrapping (For Reusable Components)

Wrap individual form components:

```tsx
// CollaborativeContactForm.tsx
import { CollaborationHarness } from './CollaborationHarness'
import { ContactForm } from './ContactForm'

export function CollaborativeContactForm({ orderId }: { orderId: string }) {
  return (
    <CollaborationHarness roomId={`order-${orderId}`}>
      <ContactForm />
    </CollaborationHarness>
  )
}
```

**Benefits**:
- ✅ Reusable across different pages
- ✅ Can be conditionally collaborative
- ✅ Portable and self-contained

## Pattern 4: Conditional Collaboration (Admin/Support Mode)

Enable collaboration only for specific users:

```tsx
function AdminLayout() {
  const { user } = useAuth()
  const isAdminOrSupport = user.role === 'admin' || user.role === 'support'

  if (isAdminOrSupport) {
    return (
      <CollaborationHarness roomId="admin-dashboard">
        <Outlet />
      </CollaborationHarness>
    )
  }

  return <Outlet />
}
```

**Benefits**:
- ✅ Collaboration for support staff only
- ✅ No overhead for regular users
- ✅ Gradual rollout strategy

## Pattern 5: Multi-Room Support

Different rooms for different contexts:

```tsx
function DocumentEditor({ documentId, mode }: Props) {
  // Separate rooms for editing vs reviewing
  const roomId = `doc-${documentId}-${mode}`

  return (
    <CollaborationHarness roomId={roomId}>
      <Editor />
    </CollaborationHarness>
  )
}
```

**Benefits**:
- ✅ Isolated collaboration spaces
- ✅ No cross-talk between different contexts
- ✅ Scalable to many documents

## Advanced: Custom Room ID Generation

```tsx
import { useParams, useSearch } from '@tanstack/react-router'

function SmartCollabLayout() {
  const params = useParams({ strict: false })
  const search = useSearch({ strict: false })

  // Generate room based on params and query strings
  const roomId = [
    'collab',
    params.orgId,
    params.formId,
    search.version,
  ].filter(Boolean).join('-')

  return (
    <CollaborationHarness roomId={roomId}>
      <Outlet />
    </CollaborationHarness>
  )
}
```

## Configuration Options

The `CollaborationHarness` accepts these props:

```tsx
interface CollaborationHarnessProps {
  children: ReactNode
  roomId?: string                    // Auto-generated from pathname if omitted
  userName?: string                  // Random name if omitted
  userColor?: string                 // Random color if omitted
  partyKitHost?: string              // Falls back to VITE_PARTYKIT_HOST
  disabled?: boolean                 // Disable all collaboration features
  submitMode?: 'any' | 'consensus'   // Submit mode (default: 'any')
  onFieldUpdate?: (fieldId, value, userId) => void
  onSchemaUpdate?: (schema) => void
}
```

## Best Practices

### Room ID Strategy

**Good**:
```tsx
// Specific and isolated
roomId="order-12345-checkout"
roomId="doc-abc123-edit"
roomId="form-contact-v2"
```

**Avoid**:
```tsx
// Too broad (everyone in same room)
roomId="forms"
roomId="app"
```

### Performance Considerations

- **Wrap at the right level**: Don't wrap your entire app unless needed
- **Use layout routes**: For multiple similar pages
- **Conditional rendering**: Disable for non-collaborative pages
- **Room isolation**: Keep rooms small (< 50 users per room)

### User Experience

- **Show connection status**: Use the green dot indicator
- **Explain field locks**: Add tooltips or help text
- **Test with latency**: Use browser dev tools to simulate slow connections
- **Mobile support**: Always test touch cursor painting on real devices

## Migration from Wrapped Components

If you have existing forms wrapped individually:

**Before**:
```tsx
// demo.tsx
<CollaborationHarness roomId="demo">
  <CheckoutForm />
</CollaborationHarness>

// other-form.tsx
<CollaborationHarness roomId="other">
  <OtherForm />
</CollaborationHarness>
```

**After (using layout route)**:
```tsx
// _collab.tsx (new)
<CollaborationHarness roomId={autoGenerated}>
  <Outlet />
</CollaborationHarness>

// _collab/demo.tsx
<CheckoutForm />

// _collab/other-form.tsx
<OtherForm />
```

## Examples Repository Structure

```
src/routes/
  __root.tsx              # Root layout
  index.tsx              # Homepage (no collaboration)
  about.tsx              # About page (no collaboration)

  _collab.tsx            # Collaboration layout
  _collab/
    checkout.tsx         # Auto-collaborative checkout
    contact.tsx          # Auto-collaborative contact form
    survey.tsx           # Auto-collaborative survey

  admin/
    _layout.tsx          # Admin layout (with conditional collab)
    dashboard.tsx        # Admin dashboard
    users.tsx           # User management
```

## Troubleshooting

### "Multiple CollaborationHarness instances"
- Don't nest CollaborationHarness components
- Use layout routes to avoid duplication

### "Wrong room ID"
- Check console logs for actual roomId being used
- Verify pathname-based generation works as expected

### "State not syncing"
- Ensure form fields have `name` or `id` attributes
- Check that fields are inside the harness container
- Verify WebSocket connection (green dot)

## Need Help?

See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment issues or [README.md](./README.md) for feature documentation.
