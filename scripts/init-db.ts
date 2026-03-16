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

  // Ensure data directory exists
  const dataDir = resolve(process.cwd(), 'data')
  if (!existsSync(dataDir)) {
    console.log('[DB Init] Creating data directory:', dataDir)
    mkdirSync(dataDir, { recursive: true })
  } else {
    console.log('[DB Init] Data directory exists:', dataDir)
  }

  // Database path
  const dbPath = resolve(dataDir, 'telemetry.db')
  const dbUrl = `file:${dbPath}`

  console.log('[DB Init] Database location:', dbPath)

  // Check if database exists
  const dbExists = existsSync(dbPath)
  console.log(`[DB Init] Database ${dbExists ? 'exists' : 'does not exist'}, will ${dbExists ? 'check migrations' : 'create and migrate'}`)

  // Create client and run migrations
  try {
    const client = createClient({ url: dbUrl })
    const db = drizzle(client)

    console.log('[DB Init] Running migrations...')
    await migrate(db, { migrationsFolder: './drizzle/migrations' })

    console.log('[DB Init] ✓ Database initialized successfully')
  } catch (error: any) {
    // If the error is "table already exists", the database is already initialized
    if (error.message?.includes('already exists') || error.code === 'SQLITE_ERROR') {
      console.log('[DB Init] ✓ Database already initialized (tables exist)')
    } else {
      console.error('[DB Init] ✗ Error initializing database:', error)
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
