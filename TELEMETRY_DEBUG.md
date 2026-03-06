# Telemetry Debugging Guide

## Issue: No Sessions Being Recorded

If telemetry sessions are not being recorded when visiting `/demo-telemetry`, follow these debugging steps:

## Quick Diagnostics

### 1. Check Browser Console

Open browser DevTools Console and look for:

```
[Telemetry] Looking for WebSocket...
[Telemetry] Found WebSocket, readyState: 1
[Telemetry] WebSocket connected and assigned to socketRef
[Telemetry] Capturing event: field_focus { fieldId: 'firstName', ... }
[Telemetry] Flushing X events (sequence Y)
[Telemetry] Flush callback - socket: WebSocket readyState: 1
[Telemetry] Sending batch to server: X events
```

**Common Issues**:
- ❌ If you see `WebSocket not ready, events will be lost`:
  - The WebSocket is not connecting properly
  - Check that integrated server is running
  - Check network tab for WebSocket connection

- ❌ If you don't see any "Capturing event" logs:
  - TelemetryEventCapture is not triggering
  - Check that you're using CollaborationHarnessWithTelemetry
  - Check that telemetryConfig.enabled = true

- ❌ If events are captured but not flushed:
  - Buffer might not be reaching threshold (100 events)
  - Wait 5 seconds for auto-flush
  - Try manually flushing by switching tabs

### 2. Check Server Console

Look for these logs in the server terminal:

```
[Server] Received TELEMETRY_BATCH from user_abc: 10 events, sequence 10
[Telemetry] ingestBatch called: roomId=room-demo-telemetry, userId=user_abc, events=10, sequence=10
[Telemetry] Added to queue. Queue size: 1
[Telemetry] Flushing 1 batches...
[Server] Telemetry batch processed successfully, sending ACK
```

**Common Issues**:
- ❌ If you don't see `[Server] Received TELEMETRY_BATCH`:
  - Client is not sending telemetry messages
  - Check client console for WebSocket errors
  - Check that `TELEMETRY_BATCH` is in the IncomingMessage type

- ❌ If you see `[Telemetry] Ingest error`:
  - Database error (check error message)
  - Permissions issue with ./data/telemetry.db
  - Schema mismatch (run migrations)

### 3. Check Database

```bash
# Verify database exists
ls -lh data/telemetry.db

# Run verification script
node scripts/verify-telemetry-db.js

# Manual query
sqlite3 data/telemetry.db "SELECT COUNT(*) FROM telemetry_sessions;"
```

**Expected Output**:
```
📊 Tables found:
  - telemetry_sessions
  - telemetry_participants
  - ...

📈 Record counts:
  telemetry_sessions: 1+ records
  telemetry_participants: 1+ records
  telemetry_interactions: 10+ records
```

## Step-by-Step Debug Process

### Step 1: Verify Integrated Server is Running

```bash
pnpm dev:integrated
```

Look for:
```
[Config] Main port: 3000
[Config] TanStack port: 4000
[Server] Integrated server listening on port 3000
```

### Step 2: Open Demo with DevTools

1. Visit http://localhost:3000/demo-telemetry
2. Open DevTools (F12)
3. Go to Console tab
4. Clear console
5. Refresh page

### Step 3: Check WebSocket Connection

1. Go to Network tab
2. Filter: WS (WebSocket)
3. Should see connection to `/parties/main/room-demo-telemetry`
4. Status: 101 Switching Protocols
5. Check Messages sub-tab

**Expected Messages**:
```
Outgoing: {"type":"IDENTIFY",...}
Outgoing: {"type":"TELEMETRY_BATCH","events":[...],"sequenceId":10}
Incoming: {"type":"TELEMETRY_ACK","sequenceId":10,"status":"success"}
```

### Step 4: Trigger Events

1. Click on "First name" field (should trigger field_focus)
2. Type some text (should trigger field_input)
3. Tab to next field (should trigger field_blur)
4. Wait 5 seconds or trigger 100+ events

### Step 5: Check Logs

**Browser Console** should show:
```
[Telemetry] Capturing event: field_focus
[Telemetry] Capturing event: field_input
[Telemetry] Flushing 10 events (sequence 10)
[Telemetry] Sending batch to server: 10 events
```

**Server Console** should show:
```
[Server] Received TELEMETRY_BATCH from user_xxx: 10 events
[Telemetry] ingestBatch called: roomId=room-demo-telemetry
[Telemetry] Flushing 1 batches...
```

### Step 6: Verify Database

```bash
node scripts/verify-telemetry-db.js
```

Should show records in multiple tables.

## Common Issues & Solutions

### Issue 1: WebSocket Never Connects

**Symptoms**:
```
[Telemetry] Looking for WebSocket...
(repeating forever, never finds it)
```

**Solution**:
- Check that CollaborationHarness is rendering
- Check that `window.__collabSocket__` is being set
- Add breakpoint in CollaborationHarness.tsx line ~500

### Issue 2: Events Captured But Not Sent

**Symptoms**:
```
[Telemetry] Capturing event: field_focus
[Telemetry] Capturing event: field_input
(but no "Flushing" message)
```

**Solution**:
- Buffer threshold not reached (wait 5 seconds)
- Or trigger 100+ events
- Or manually call `telemetryClient.flush()`

### Issue 3: Server Not Receiving Messages

**Symptoms**:
```
[Telemetry] Sending batch to server: 10 events
(but server shows nothing)
```

**Solution**:
- Check WebSocket connection status
- Check that TELEMETRY_BATCH is in IncomingMessage type
- Check server integrated-server.ts has the case handler
- Restart server

### Issue 4: Database Write Errors

**Symptoms**:
```
[Telemetry] Ingest error: SQLITE_ERROR: no such table
```

**Solution**:
```bash
# Regenerate migrations
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit push

# Verify tables exist
sqlite3 data/telemetry.db ".tables"
```

### Issue 5: PII Mode Issues

**Symptoms**:
- Database shows null/undefined values

**Solution**:
- Check telemetryConfig.piiMode setting
- For testing, use `piiMode: 'capture'`
- For production, use `piiMode: 'anonymize'`

## Debug Checklist

- [ ] Server running (`pnpm dev:integrated`)
- [ ] Visiting `/demo-telemetry` (not `/demo`)
- [ ] Browser console shows `[Telemetry]` logs
- [ ] WebSocket connection shows in Network tab
- [ ] WebSocket status: 101 Switching Protocols
- [ ] Server console shows `[Server]` telemetry logs
- [ ] Database file exists (`ls data/telemetry.db`)
- [ ] Tables created (`node scripts/verify-telemetry-db.js`)
- [ ] No errors in browser console
- [ ] No errors in server console

## Manual Testing Script

```javascript
// Run in browser console on /demo-telemetry page

// 1. Check if telemetry is enabled
console.log('Socket:', (window as any).__collabSocket__);

// 2. Trigger events manually
const input = document.querySelector('input[name="firstName"]');
input.focus();
input.value = 'Test';
input.dispatchEvent(new Event('input', { bubbles: true }));
input.blur();

// 3. Wait 5 seconds, then check database
setTimeout(() => {
  console.log('Check database now: node scripts/verify-telemetry-db.js');
}, 5000);
```

## Production Checklist

Before deploying to production:

- [ ] Remove console.log debug statements
- [ ] Set `TELEMETRY_PII_MODE=anonymize`
- [ ] Set `TELEMETRY_SAMPLE_RATE=0.1` (10%)
- [ ] Set `TELEMETRY_CAPTURE_CURSORS=false`
- [ ] Set up database backup
- [ ] Set up retention policy automation
- [ ] Monitor database size growth
- [ ] Set up error alerting

## Getting Help

If you still can't get telemetry working:

1. Check all logs (browser + server)
2. Verify database schema matches code
3. Test with basic `/demo` route first (ensure collaboration works)
4. Create minimal reproduction
5. Check GitHub issues

## Files to Check

- `/src/components/CollaborationHarnessWithTelemetry.tsx` - Wrapper component
- `/src/lib/telemetry-client.ts` - Client-side capture
- `/src/lib/telemetry-buffer.ts` - Event buffering
- `/server/integrated-server.ts` - WebSocket handler (line ~268)
- `/server/telemetry-handler.ts` - Database ingestion
- `/drizzle/schema-telemetry.ts` - Database schema

---

**Last Updated**: 2026-03-05
**Status**: Debugging guide for telemetry session recording issues
