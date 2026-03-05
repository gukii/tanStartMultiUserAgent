# Telemetry Quick Start Guide

Get telemetry running in your forms in **5 minutes**.

## Step 1: Swap the Component (30 seconds)

**Before** (basic collaboration):
```tsx
import { CollaborationHarness } from './components/CollaborationHarness';

<CollaborationHarness roomId="checkout-42" userName="Alice">
  <CheckoutForm />
</CollaborationHarness>
```

**After** (with telemetry):
```tsx
import { CollaborationHarnessWithTelemetry } from './components/CollaborationHarnessWithTelemetry';

<CollaborationHarnessWithTelemetry
  roomId="checkout-42"
  userName="Alice"
  telemetryConfig={{ enabled: true }}
>
  <CheckoutForm />
</CollaborationHarnessWithTelemetry>
```

## Step 2: Configure Privacy (1 minute)

Choose your PII handling mode in `.env`:

```env
# Recommended for production (hashes field values)
TELEMETRY_PII_MODE=anonymize

# OR: Maximum privacy (doesn't store field values)
# TELEMETRY_PII_MODE=omit

# OR: Internal tools only (stores raw values)
# TELEMETRY_PII_MODE=capture
```

## Step 3: Start the Server (30 seconds)

```bash
pnpm dev:integrated
```

## Step 4: Test It (2 minutes)

1. Open http://localhost:3000/demo
2. Type in some fields
3. Focus/blur fields
4. Trigger a validation error (try submitting empty required field)

## Step 5: Verify Data (1 minute)

```bash
# Check that events were captured
node scripts/verify-telemetry-db.js

# Should show:
# ✅ telemetry_sessions: 1+ records
# ✅ telemetry_participants: 1+ records
# ✅ telemetry_interactions: 10+ records
```

## Done! 🎉

You're now capturing:
- ✅ Field focus/blur events
- ✅ Keystroke timing
- ✅ Validation errors
- ✅ AI draft interactions
- ✅ User session data

## Next Steps

### View the Data

```bash
# Open database in SQLite
sqlite3 data/telemetry.db

# Run queries
sqlite> SELECT event_type, COUNT(*) FROM telemetry_interactions GROUP BY event_type;
```

### Customize Configuration

```tsx
<CollaborationHarnessWithTelemetry
  telemetryConfig={{
    enabled: true,
    piiMode: 'anonymize',
    sampleRate: 0.5,           // Track 50% of sessions
    captureKeystrokes: true,   // Detailed typing analysis
    captureCursors: false,     // Cursor tracking (high volume)
  }}
>
  <CheckoutForm />
</CollaborationHarnessWithTelemetry>
```

### Analyze User Proficiency

```sql
-- Average field completion time per user
SELECT
  user_name,
  AVG(duration_ms) / 1000.0 as avg_seconds_per_field,
  COUNT(*) as fields_edited
FROM telemetry_field_sessions fs
JOIN telemetry_participants p ON fs.participant_id = p.id
GROUP BY user_name;
```

### Find Problematic Fields

```sql
-- Fields with highest error rates
SELECT
  field_id,
  SUM(had_validation_error) * 100.0 / COUNT(*) as error_rate,
  COUNT(*) as total_attempts
FROM telemetry_field_sessions
GROUP BY field_id
HAVING COUNT(*) > 5
ORDER BY error_rate DESC;
```

### Track AI Effectiveness

```sql
-- AI draft acceptance rate
SELECT
  COUNT(*) FILTER (WHERE user_action = 'accepted') * 100.0 / COUNT(*) as acceptance_rate,
  AVG(time_to_decision_ms) / 1000.0 as avg_decision_seconds
FROM telemetry_ai_interactions;
```

## Troubleshooting

### No Events Captured?

1. Check `.env` has `TELEMETRY_ENABLED=true`
2. Verify you're using `CollaborationHarnessWithTelemetry` (not basic harness)
3. Check browser console for errors
4. Verify WebSocket is connected (Network tab → WS)

### Database Errors?

```bash
# Regenerate database
npx drizzle-kit push
```

### Too Much Data?

```env
# Reduce sample rate (track 10% of sessions)
TELEMETRY_SAMPLE_RATE=0.1

# Disable high-volume events
TELEMETRY_CAPTURE_CURSORS=false
TELEMETRY_CAPTURE_KEYSTROKES=false
```

## Learn More

- **Full Documentation**: See `TELEMETRY_README.md`
- **Implementation Details**: See `TELEMETRY_IMPLEMENTATION_SUMMARY.md`
- **Database Schema**: See `drizzle/schema-telemetry.ts`
- **Event Types**: See `src/types/telemetry.ts`

---

**Total Time**: ~5 minutes from zero to capturing telemetry! 🚀
