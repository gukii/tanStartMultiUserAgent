# Telemetry System Documentation

## Overview

The telemetry system is an **optional module** that wraps the `CollaborationHarness` to capture rich interaction data for analysis. It's designed with a clean separation of concerns - the core collaboration system remains unchanged, and telemetry is completely opt-in.

## Features

- **Rich event capture**: Tracks field interactions, keystrokes, validation errors, AI drafts, cursor movements, and more
- **Privacy-aware**: Three PII modes (capture/anonymize/omit) with configurable data sanitization
- **Performance optimized**: Client-side batching (100 events or 5s intervals), server-side async ingestion
- **Non-blocking**: Telemetry failures never break collaboration features
- **Database persistence**: SQLite/libsql storage with 10 comprehensive tables
- **GDPR compliant**: Data retention policies, export, and deletion capabilities

## Quick Start

### 1. Basic Usage (No Telemetry)

```tsx
import { CollaborationHarness } from './components/CollaborationHarness';

<CollaborationHarness roomId="checkout-42" userName="Alice">
  <CheckoutForm />
</CollaborationHarness>
```

### 2. With Telemetry (Opt-In)

```tsx
import { CollaborationHarnessWithTelemetry } from './components/CollaborationHarnessWithTelemetry';

<CollaborationHarnessWithTelemetry
  roomId="checkout-42"
  userName="Alice"
  telemetryConfig={{
    enabled: true,
    piiMode: 'anonymize',
    captureKeystrokes: true,
    captureCursors: false,
  }}
>
  <CheckoutForm />
</CollaborationHarnessWithTelemetry>
```

### 3. Progressive Adoption (Environment-Based)

```tsx
import { getTelemetryWrapper } from './components/CollaborationHarnessWithTelemetry';

// Uses telemetry wrapper if VITE_TELEMETRY_ENABLED=true
const Wrapper = getTelemetryWrapper();

<Wrapper roomId="checkout-42" userName="Alice">
  <CheckoutForm />
</Wrapper>
```

## Configuration

### Environment Variables (`.env`)

```env
# Enable/disable telemetry system
TELEMETRY_ENABLED=true

# Sample rate (0.0 to 1.0) - percentage of sessions to track
TELEMETRY_SAMPLE_RATE=1.0

# Capture detailed keystroke timing data
TELEMETRY_CAPTURE_KEYSTROKES=true

# Capture cursor movement data (high volume)
TELEMETRY_CAPTURE_CURSORS=false

# Data retention period (days)
TELEMETRY_RETENTION_DAYS=90

# PII handling mode: 'capture' | 'anonymize' | 'omit'
TELEMETRY_PII_MODE=anonymize

# Database configuration
TELEMETRY_DB_URL=file:./data/telemetry.db
# TELEMETRY_DB_TOKEN=your_turso_token_here  # Only for Turso
```

### Component Props

```tsx
interface TelemetryConfig {
  enabled?: boolean;         // Default: true
  sampleRate?: number;      // Default: 1.0 (0.0-1.0)
  piiMode?: PiiMode;        // Default: 'anonymize'
  captureKeystrokes?: boolean; // Default: true
  captureCursors?: boolean;    // Default: false
}
```

### PII Modes

- **`capture`**: Store raw field values (internal tools only)
- **`anonymize`**: Hash field values using SHA-256 (recommended for production)
- **`omit`**: Don't store field values at all (maximum privacy)

## Database Schema

The telemetry system uses 10 tables to capture comprehensive interaction data:

1. **telemetry_sessions** - High-level session metadata
2. **telemetry_participants** - User/agent information per session
3. **telemetry_interactions** - Raw event stream (high-volume)
4. **telemetry_field_sessions** - Per-field metrics (focus time, edits, completion)
5. **telemetry_keystroke_sequences** - Typing cadence analysis
6. **telemetry_cursor_movements** - Sampled cursor positions (200ms intervals)
7. **telemetry_validation_events** - Validation errors and corrections
8. **telemetry_ai_interactions** - AI suggestion lifecycle tracking
9. **telemetry_conflict_events** - Field lock conflicts and resolutions
10. **telemetry_performance_metrics** - Client-side performance samples

### Database Setup

```bash
# Generate migrations
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit push

# Verify database
ls -lh data/telemetry.db
```

## Captured Events

### Field Events
- `field_focus` - User focuses on a field
- `field_blur` - User leaves a field
- `field_input` - Keystroke entered
- `field_change` - Field value changed
- `field_paste` - Content pasted into field

### Validation Events
- `validation_error` - Validation failure
- `validation_correction` - Error resolved

### AI Draft Events
- `draft_received` - AI suggestion provided
- `draft_accepted` - User accepted suggestion
- `draft_rejected` - User rejected suggestion
- `draft_modified` - User modified suggestion

### Cursor Events (Optional)
- `cursor_move` - Cursor position sampled (200ms intervals)

### Conflict Events
- `lock_denied` - Field lock request denied
- `force_takeover` - User forced field takeover

### Performance Events
- `performance_sample` - Client performance metrics (10s intervals)

## Architecture

### Client-Side Flow

1. **Event Capture** - `TelemetryEventCapture` uses DOM event listeners (capture phase)
2. **Buffering** - `TelemetryBuffer` batches events (100 events or 5s)
3. **Transmission** - WebSocket `TELEMETRY_BATCH` messages sent to server
4. **Acknowledgment** - Server responds with `TELEMETRY_ACK`

### Server-Side Flow

1. **Message Handler** - Integrated server receives `TELEMETRY_BATCH`
2. **Async Queue** - `TelemetryHandler` queues events (non-blocking via `setImmediate`)
3. **Batch Write** - Bulk inserts to database (500 events per transaction)
4. **Deduplication** - Sequence IDs prevent duplicate processing

### Error Isolation

**Critical requirement**: Telemetry failures must never break collaboration.

- All telemetry calls wrapped in `try-catch`
- Server uses `setImmediate` for async processing
- Client buffers retry on failure
- Graceful degradation when context unavailable

## Querying Telemetry Data

### Example Queries

```sql
-- Session summary
SELECT
  id,
  room_id,
  route,
  started_at,
  duration_ms,
  total_participants,
  total_interactions,
  outcome
FROM telemetry_sessions
ORDER BY started_at DESC
LIMIT 10;

-- User proficiency (average field completion time)
SELECT
  p.user_name,
  AVG(fs.duration_ms) as avg_field_time_ms,
  COUNT(*) as total_fields_edited,
  SUM(fs.had_validation_error) as total_errors
FROM telemetry_field_sessions fs
JOIN telemetry_participants p ON fs.participant_id = p.id
GROUP BY p.user_name;

-- AI draft acceptance rate
SELECT
  COUNT(*) FILTER (WHERE user_action = 'accepted') * 100.0 / COUNT(*) as acceptance_rate,
  AVG(time_to_decision_ms) as avg_decision_time
FROM telemetry_ai_interactions
WHERE user_action IN ('accepted', 'rejected');

-- Field difficulty analysis (by validation error rate)
SELECT
  field_id,
  COUNT(*) as total_sessions,
  SUM(had_validation_error) * 100.0 / COUNT(*) as error_rate,
  AVG(duration_ms) as avg_completion_time
FROM telemetry_field_sessions
GROUP BY field_id
ORDER BY error_rate DESC;

-- Event timeline for a session
SELECT
  timestamp,
  event_type,
  event_category,
  field_id,
  data
FROM telemetry_interactions
WHERE session_id = 'your-session-id'
ORDER BY timestamp;
```

## Use Cases

### 1. User Proficiency Analysis
- Track keystroke speed and patterns
- Identify error-prone fields
- Measure completion times per field
- Compare novice vs expert behavior

### 2. AI Agent Evaluation
- Measure suggestion acceptance rates
- Track time-to-decision for AI drafts
- Calculate edit distance (how much users modify suggestions)
- Identify when AI helps vs hinders

### 3. Form UX Optimization
- Find fields with high abandonment rates
- Detect validation error hotspots
- Measure field completion order
- Identify confusing field labels

### 4. Training Insights
- Track team collaboration patterns
- Measure individual progress over time
- Identify knowledge gaps
- Generate personalized coaching

## Future Extension: Website-Wide Protocol

**Vision**: Extend telemetry beyond forms to entire web applications.

Key concepts:
1. **Semantic markup** - Rich AI intent annotations (`data-ai-intent`, `data-ai-action`)
2. **Structured feedback** - Machine-readable validation and error messages
3. **State observability** - Expose app state to AI agents (`window.__AI_STATE__`)
4. **Telemetry hooks** - Every interactive element emits standardized events
5. **Protocol-level telemetry** - Track AI agent "understanding" of page structure

This creates a standardized "AI-agent-ready" web interface protocol (like SEO metadata for search engines).

## Troubleshooting

### Telemetry Not Capturing Events

1. Check `.env` file: `TELEMETRY_ENABLED=true`
2. Verify component usage: `CollaborationHarnessWithTelemetry` (not basic harness)
3. Check browser console for errors
4. Verify WebSocket connection is open

### Database Errors

```bash
# Regenerate migrations
npx drizzle-kit generate

# Force push schema
npx drizzle-kit push

# Check database file exists
ls -lh data/telemetry.db
```

### High Memory Usage

1. Reduce sample rate: `TELEMETRY_SAMPLE_RATE=0.1` (10% of sessions)
2. Disable cursor capture: `TELEMETRY_CAPTURE_CURSORS=false`
3. Disable keystroke capture: `TELEMETRY_CAPTURE_KEYSTROKES=false`
4. Reduce retention: `TELEMETRY_RETENTION_DAYS=30`

## Performance Considerations

### Client-Side Overhead

- **Disabled**: Zero overhead (wrapper renders basic harness)
- **Enabled**: <500 bytes/sec/user, <10ms CPU per batch

### Server-Side Overhead

- **Async processing**: WebSocket message handling not blocked
- **Batched writes**: 500 events per transaction (~100ms)
- **Non-blocking queue**: Uses `setImmediate` for async ingestion

### Database Growth

- **Typical session**: ~1000 events = ~500KB
- **Daily volume** (100 users): ~50MB/day
- **90-day retention**: ~4.5GB

## Contributing

When adding new telemetry events:

1. Define event type in `/src/types/telemetry.ts`
2. Add capture logic in `/src/components/TelemetryEventCapture.tsx`
3. Add processing logic in `/server/telemetry-handler.ts`
4. Update database schema in `/drizzle/schema-telemetry.ts` (if needed)
5. Generate and apply migrations

## License

Same as parent project.
