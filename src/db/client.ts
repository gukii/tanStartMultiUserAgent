import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schemaTelemetry from '../../drizzle/schema-telemetry';

/**
 * Telemetry Database Client
 *
 * Lazy-initialized database connection for telemetry data.
 * Only created on server-side to prevent client-side database access.
 */

// Database configuration from environment
const TELEMETRY_DB_URL = process.env.TELEMETRY_DB_URL || 'file:./data/telemetry.db';
const TELEMETRY_DB_TOKEN = process.env.TELEMETRY_DB_TOKEN;

let _client: ReturnType<typeof createClient> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Get or create libsql client (server-side only)
 */
function getClient() {
  if (typeof window !== 'undefined') {
    throw new Error('Telemetry database client should only be used server-side');
  }

  if (!_client) {
    _client = createClient({
      url: TELEMETRY_DB_URL,
      ...(TELEMETRY_DB_TOKEN && { authToken: TELEMETRY_DB_TOKEN }),
    });
  }

  return _client;
}

/**
 * Get or create drizzle database instance
 */
function getDb() {
  if (!_db) {
    _db = drizzle(getClient(), { schema: schemaTelemetry });
  }
  return _db;
}

/**
 * Telemetry database instance (lazy-initialized via Proxy)
 *
 * This Proxy ensures the database connection is only created when actually used,
 * preventing initialization errors during build or client-side rendering.
 */
export const telemetryDb = new Proxy({} as ReturnType<typeof drizzle>, {
  get(target, prop) {
    return getDb()[prop as keyof ReturnType<typeof drizzle>];
  }
});

/**
 * Export schema for easy access
 */
export { schemaTelemetry };
