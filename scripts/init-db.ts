/**
 * Initialize telemetry database
 *
 * Creates the data directory and runs migrations if needed.
 * Safe to run multiple times - only creates/migrates if necessary.
 */

import { existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'

async function initDatabase() {
  console.log('[DB Init] Starting database initialization...')

  // Use same environment-aware path logic as client.ts and drizzle.config.ts
  const isProduction = process.env.NODE_ENV === 'production'
  const TELEMETRY_DB_URL = process.env.TELEMETRY_DB_URL ||
    (isProduction ? 'file:/app/data/telemetry.db' : 'file:./data/telemetry.db')

  console.log(`[DB Init] Environment: ${isProduction ? 'production' : 'development'}`)
  console.log('[DB Init] Database URL:', TELEMETRY_DB_URL)

  // Extract directory path from URL (remove "file:" prefix)
  const dbPath = TELEMETRY_DB_URL.replace('file:', '')
  const dataDir = resolve(dbPath, '..')

  // Ensure data directory exists (with error handling for build phase)
  try {
    if (!existsSync(dataDir)) {
      console.log('[DB Init] Creating data directory:', dataDir)
      mkdirSync(dataDir, { recursive: true })
    } else {
      console.log('[DB Init] Data directory exists:', dataDir)
    }
  } catch (error: any) {
    // During Railway build phase, persistent volumes aren't mounted yet
    // Skip initialization and let it happen at runtime instead
    console.log('[DB Init] Cannot create data directory (likely build phase):', error.message)
    console.log('[DB Init] Skipping database initialization - will retry at runtime')
    return
  }

  console.log('[DB Init] Database location:', dbPath)
  console.log('[DB Init] Data directory:', dataDir)

  // Verify directory is writable
  try {
    const { accessSync, constants } = await import('fs')
    accessSync(dataDir, constants.W_OK)
    console.log('[DB Init] ✓ Data directory is writable')
  } catch (error: any) {
    console.error('[DB Init] ✗ Data directory is not writable:', error.message)
    console.error('[DB Init] Please check Railway volume mount configuration')
    throw new Error(`Data directory ${dataDir} is not writable: ${error.message}`)
  }

  // Check if database exists
  const dbExists = existsSync(dbPath)
  console.log(`[DB Init] Database ${dbExists ? 'exists' : 'does not exist'}, will ${dbExists ? 'check migrations' : 'create and migrate'}`)

  // Create client and run migrations
  try {
    console.log('[DB Init] Creating database client...')
    const client = createClient({ url: TELEMETRY_DB_URL })
    const db = drizzle(client)

    console.log('[DB Init] Running migrations from ./drizzle/migrations')
    await migrate(db, { migrationsFolder: './drizzle/migrations' })

    console.log('[DB Init] ✓ Database initialized successfully')
  } catch (error: any) {
    // If the error is "table already exists", the database is already initialized
    if (error.message?.includes('already exists') || error.code === 'SQLITE_ERROR') {
      console.log('[DB Init] ✓ Database already initialized (tables exist)')
    } else {
      console.error('[DB Init] ✗ Error initializing database')
      console.error('[DB Init] Error details:', {
        message: error.message,
        code: error.code,
        dbPath,
        dataDir,
        dbExists,
      })
      throw error
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initDatabase()
    .then(() => {
      console.log('[DB Init] Complete')
      process.exit(0)
    })
    .catch((err) => {
      console.error('[DB Init] Failed:', err)
      process.exit(1)
    })
}

export { initDatabase }
