# Deployment Guide

This guide covers deploying the TanStack Start app to Railway and the PartyKit WebSocket server to PartyKit's hosting.

## Quick Start (5 minutes)

```bash
# 1. Deploy PartyKit WebSocket server
npx partykit deploy

# 2. Note your PartyKit URL (e.g., collaboration-harness.YOUR-USERNAME.partykit.dev)

# 3. Push to GitHub and connect to Railway

# 4. Add environment variable in Railway:
#    VITE_PARTYKIT_HOST=collaboration-harness.YOUR-USERNAME.partykit.dev
#    (without https://)

# Done! Your app is live
```

## Prerequisites

1. [PartyKit account](https://www.partykit.io/) (free tier available)
2. [Railway account](https://railway.app/) (free tier available)
3. Git repository (GitHub, GitLab, or Bitbucket)

## Step 1: Deploy PartyKit Server

The PartyKit server handles real-time WebSocket connections for collaboration.

### 1.1 Login to PartyKit

```bash
npx partykit login
```

### 1.2 Deploy the Party

```bash
pnpm run deploy:party
```

Or manually:

```bash
npx partykit deploy
```

### 1.3 Note Your PartyKit URL

After deployment, you'll see output like:

```
✓ Successfully deployed to: https://collaboration-harness.YOUR-USERNAME.partykit.dev
```

**Save this URL** - you'll need it for Railway.

## Step 2: Deploy TanStack Start App to Railway

### 2.1 Create a New Railway Project

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Connect your GitHub account and select this repository

### 2.2 Configure Build Settings

In Railway project settings:

**Build Command:**
```bash
pnpm install && pnpm build
```

**Start Command:**
```bash
pnpm preview
```

Or create a `Procfile` in the project root:
```
web: pnpm preview
```

### 2.3 Add Environment Variable

In Railway project settings → Variables:

```
VITE_PARTYKIT_HOST=collaboration-harness.YOUR-USERNAME.partykit.dev
```

Replace with your actual PartyKit URL from Step 1.3 (without `https://` or `http://`).

### 2.4 Configure Port

Railway expects your app on the PORT environment variable. Update `package.json`:

```json
{
  "scripts": {
    "preview": "vite preview --port $PORT --host 0.0.0.0"
  }
}
```

### 2.5 Deploy

Railway will automatically deploy when you push to your GitHub repository.

## Step 3: Test the Deployment

1. Open your Railway app URL (e.g., `https://your-app.up.railway.app`)
2. Open the same URL in another browser/tab/device
3. Test:
   - Cursor synchronization
   - Field locking
   - Touch cursor painting (on mobile)
   - Cursor messages

## Troubleshooting

### PartyKit Connection Issues

If cursors aren't syncing:

1. Check browser console for WebSocket errors
2. Verify `VITE_PARTYKIT_HOST` doesn't include `http://` or `https://`
3. Ensure PartyKit deployment succeeded: `npx partykit list`

### Railway Build Failures

1. Check build logs in Railway dashboard
2. Ensure all dependencies are in `package.json`
3. Try building locally first: `pnpm build && pnpm preview`

### CORS Issues

PartyKit allows all origins by default. If you need to restrict:

In `party/server.ts`, add CORS headers in the `onRequest` method.

## Local Development

To test the production setup locally:

1. Start PartyKit dev server:
   ```bash
   pnpm dev:party
   ```

2. In another terminal, start the app:
   ```bash
   pnpm dev
   ```

3. Set environment variable:
   ```bash
   VITE_PARTYKIT_HOST=127.0.0.1:1999 pnpm dev
   ```

## Cost Estimate

- **PartyKit Free Tier**: 100 concurrent connections, 1M messages/month
- **Railway Free Tier**: $5 credit/month, ~550 hours
- **Estimated cost for testing**: $0 (within free tiers)

## Production Considerations

For production use:

1. **PartyKit Pro**: For more connections ($29/mo)
2. **Railway Pro**: For guaranteed uptime ($5/mo + usage)
3. **Custom Domain**: Configure in Railway settings
4. **SSL**: Automatic with Railway and PartyKit
5. **Monitoring**: Add error tracking (Sentry, etc.)

## Alternative: Self-Host PartyKit

If you prefer to self-host the WebSocket server:

1. Deploy `party/server.ts` as a Cloudflare Worker
2. Or use any WebSocket server (Socket.io, etc.)
3. Update client connection code accordingly

See [PartyKit self-hosting docs](https://docs.partykit.io/guides/self-hosting/) for details.

## Pre-Deployment Checklist

Before deploying, verify:

- [ ] `pnpm build` completes without errors
- [ ] No TypeScript errors: `pnpm tsc --noEmit`
- [ ] PartyKit server is deployed and accessible
- [ ] `.env.example` is committed (for documentation)
- [ ] `railway.json` is present in project root
- [ ] `package.json` has `start` script configured
- [ ] All code is committed to Git
- [ ] Repository is pushed to GitHub/GitLab/Bitbucket

## Deployment Status Verification

After deployment, test these features:

1. **Basic Loading**: App loads at your Railway URL
2. **PartyKit Connection**: Green dot appears (top-right of form)
3. **Multi-Tab Test**: Open 2 tabs, see each other's cursors
4. **Field Locking**: Focus a field in tab 1, try to type in tab 2 (should be locked)
5. **Field Sync**: Type in tab 1, see it appear in tab 2
6. **Cursor Messages**: Set a cursor message, see it on other tab
7. **Touch Mode** (mobile): Toggle touch cursor painting, drag finger to paint cursor
8. **Force Eviction**: Lock a field, wait 3+ seconds of inactivity, double-click to take control

## Quick Fixes

### "WebSocket connection failed"
- Check VITE_PARTYKIT_HOST doesn't include `https://` or `http://`
- Verify PartyKit URL is correct: `npx partykit list`
- Check Railway environment variables are set

### "Build failed"
- Clear Railway cache: Settings → Reset → Clear Build Cache
- Verify all dependencies are in `package.json`
- Check Railway build logs for specific error

### "App crashes on start"
- Check Railway logs: View → Logs
- Verify PORT environment variable is being used
- Test locally: `pnpm build && pnpm start`

## Railway-Specific Tips

- **Custom Domain**: Railway Settings → Networking → Add Domain
- **SSL**: Automatic with Railway and PartyKit (no configuration needed)
- **Logs**: Real-time logs available in Railway dashboard
- **Rollback**: Click any previous deployment to roll back
- **Multiple Environments**: Create separate Railway projects for staging/production
