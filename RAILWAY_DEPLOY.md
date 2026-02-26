# Railway Deployment Guide - Self-Hosted WebSocket

This guide covers deploying the integrated server (WebSocket + TanStack Start) to Railway on a single port.

## Architecture

The integrated server combines:
- **WebSocket Server** - Handles `/parties/main/:roomId` paths
- **TanStack Start** - Runs internally on `PORT+1000`
- **HTTP Proxy** - Forwards other requests to TanStack Start

Railway exposes only the main `PORT`, and everything works seamlessly.

## Local Testing

Verified working locally:
```bash
# Terminal 1: Start integrated server
pnpm dev:integrated

# Terminal 2: Open browser
open http://localhost:3000/demo

# Open the same URL in multiple tabs to test collaboration
```

## Railway Deployment Steps

### 1. Build the Project

```bash
# Build TanStack Start
pnpm build

# This creates dist/client and dist/server
```

### 2. Push to GitHub

```bash
git add .
git commit -m "Add self-hosted WebSocket server for Railway"
git push origin main
```

### 3. Deploy to Railway

1. Go to [railway.app](https://railway.app)
2. Create a new project from your GitHub repo
3. Railway will automatically detect the project

### 4. Configure Environment Variables

**Important:** You do NOT need to set `VITE_PARTYKIT_HOST` because the WebSocket server runs on the same domain.

If you need any custom config, set:
- `NODE_ENV=production`
- Any other app-specific variables

### 5. Verify Deployment

Railway will:
1. Run `pnpm install`
2. Run `pnpm build` (from railway.json)
3. Run `pnpm start` (starts integrated-server.ts)

Check the logs for:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 Integrated Server running
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 6. Test Deployed App

Visit your Railway URL (e.g., `https://your-app.railway.app`):

1. **Health check**: `https://your-app.railway.app/health`
   - Should return: `{"status":"ok","websocket":"active",...}`

2. **Demo page**: `https://your-app.railway.app/demo`
   - Open in multiple tabs/devices
   - Verify cursor tracking and field sync

3. **WebSocket** (automatic):
   - Connects to `wss://your-app.railway.app/parties/main/:roomId`
   - No configuration needed!

## How It Works

### Integrated Server Flow

```
Railway PORT (e.g., 3000)
     │
     ├─ /health                    → JSON response
     ├─ /parties/main/:roomId      → WebSocket upgrade
     └─ /* (all other paths)       → Proxy to TanStack Start (internal PORT+1000)
```

### Production Startup

When `pnpm start` runs:
1. `integrated-server.ts` starts
2. It spawns TanStack Start on internal port (e.g., 4000)
3. Integrated server listens on Railway's PORT (e.g., 3000)
4. HTTP requests → proxied to TanStack
5. WebSocket upgrades → handled directly

### Client-Side Connection

The CollaborationHarness automatically detects the WebSocket URL:
```typescript
// No VITE_PARTYKIT_HOST needed!
// Connects to same domain: wss://your-app.railway.app/parties/main/:roomId
```

## Troubleshooting

### 1. WebSocket Not Connecting

Check browser console for errors. The WebSocket should connect to the same domain:
```
wss://your-app.railway.app/parties/main/...
```

### 2. 502 Bad Gateway

This means TanStack Start isn't responding. Check logs:
```
[TanStack] Server should be running on http://127.0.0.1:4000
```

If the internal server fails, increase the startup timeout in `integrated-server.ts` line 343:
```typescript
setTimeout(() => {
  resolve()
}, 5000) // Increase from 3000 to 5000
```

### 3. Health Check Failing

Railway expects `/health` to return 200. Check:
```bash
curl https://your-app.railway.app/health
```

Should return JSON with `{"status":"ok",...}`

### 4. Port Already in Use (Local Testing)

Kill all node processes:
```bash
lsof -ti:3000 | xargs kill -9
lsof -ti:4000 | xargs kill -9
```

## Cost Estimate

Railway pricing (as of 2024):
- Hobby Plan: $5/month for basic usage
- Usage-based: ~$0.01/hour for active server time

This self-hosted approach costs **significantly less** than managed PartyKit hosting, especially at scale.

## Monitoring

Railway provides:
- Live logs
- Metrics (CPU, memory)
- Deployment history

Access via: https://railway.app/project/[your-project]

## Environment Variables (Optional)

You can set these in Railway dashboard:
- `NODE_ENV` - Automatically set to `production`
- `PORT` - Automatically provided by Railway

**No VITE_PARTYKIT_HOST needed** because WebSocket runs on same domain!

## Rollback

If deployment fails:
1. Go to Railway dashboard
2. Click "Deployments"
3. Select a previous working deployment
4. Click "Redeploy"

## Next Steps

After deploying:
1. Test with multiple users on different devices
2. Monitor Railway logs for any errors
3. Test mobile touch cursor painting feature
4. Verify field locking and eviction work correctly

## Success Criteria

✅ Health endpoint returns JSON
✅ Demo page loads and renders
✅ WebSocket connects (check browser console)
✅ Multiple tabs can see each other's cursors
✅ Field locking works correctly
✅ Field values sync across clients

---

**Ready to deploy!** Just push to GitHub and connect to Railway.
