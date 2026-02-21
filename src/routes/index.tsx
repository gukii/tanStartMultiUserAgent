import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-2 text-2xl">{icon}</div>
      <h3 className="mb-1 font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-600">{body}</p>
    </div>
  )
}

function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
        CollaborationHarness
      </div>
      <h1 className="mb-3 text-4xl font-bold tracking-tight text-gray-900">
        Multiplayer&nbsp;/ AI Universal Harness
      </h1>
      <p className="mb-8 text-lg text-gray-600">
        Wrap <em>any</em> form or admin panel in{' '}
        <code className="rounded bg-violet-50 px-1 font-mono text-violet-700">
          &lt;CollaborationHarness&gt;
        </code>{' '}
        and immediately get real-time cursors, shared field state, and an AI
        coaching layer — with zero changes to the wrapped component.
      </p>

      <Link
        to="/demo"
        className="mb-12 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-3 font-semibold text-white shadow hover:bg-violet-700 transition-colors"
      >
        Open live demo →
      </Link>

      <div className="grid gap-4 sm:grid-cols-2">
        <Feature
          icon="🌐"
          title="Transport layer"
          body="Connects to a PartyKit room derived from the current URL. Works with any WebSocket-compatible host."
        />
        <Feature
          icon="🗺️"
          title="Live semantic map"
          body="MutationObserver scans the DOM for inputs, labels, aria-labels, and data-ai-intent hints — then broadcasts a typed FieldSchema[] to every peer."
        />
        <Feature
          icon="👻"
          title="Ghost cursors"
          body="Remote cursors snap to the same field element on each client's layout using getBoundingClientRect, staying accurate across different screen sizes."
        />
        <Feature
          icon="🤝"
          title="Collaborative state bridge"
          body="Field updates are broadcast and applied via a native input event trick so React controlled components (including TanStack Form) react normally."
        />
        <Feature
          icon="🤖"
          title="AI coaching"
          body="An LLM Agent receives the live schema, suggests draft values per field, and humans Accept or Reject them in a highlighted bubble."
        />
        <Feature
          icon="🛡️"
          title="CRDT-lite conflict resolution"
          body="Every field write carries a Unix timestamp. Stale remote updates are silently dropped, preventing cursor-jumping when two peers type simultaneously."
        />
      </div>
    </main>
  )
}
