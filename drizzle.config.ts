import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';

dotenv.config();

// Use Railway persistent volume path in production, local path in development
const isProduction = process.env.NODE_ENV === 'production';
let TELEMETRY_DB_URL = process.env.TELEMETRY_DB_URL ||
  (isProduction ? 'file:/app/data/telemetry.db' : 'file:./data/telemetry.db');

// During Railway build phase, /app/data doesn't exist yet (persistent volume not mounted)
// Check if the target directory exists, if not use a temporary safe path
const dbPath = TELEMETRY_DB_URL.replace('file:', '');
const dbDir = dirname(dbPath);

if (!existsSync(dbDir)) {
  console.log(`[Drizzle Config] Directory ${dbDir} doesn't exist (likely build phase)`);
  console.log('[Drizzle Config] Using temporary database path for build');
  TELEMETRY_DB_URL = 'file:/tmp/build-temp.db';
}

const TELEMETRY_DB_TOKEN = process.env.TELEMETRY_DB_TOKEN;

// Detect if using local file or Turso
const isLocalFile = TELEMETRY_DB_URL?.startsWith('file:');

export default defineConfig({
  schema: './drizzle/schema-telemetry.ts',
  out: './drizzle/migrations',
  dialect: isLocalFile ? 'sqlite' : 'turso',
  dbCredentials: isLocalFile
    ? { url: TELEMETRY_DB_URL }
    : {
        url: TELEMETRY_DB_URL,
        authToken: TELEMETRY_DB_TOKEN!,
      },
  verbose: true,
});
