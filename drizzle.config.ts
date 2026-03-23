import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

// Use Railway persistent volume path in production, local path in development
const isProduction = process.env.NODE_ENV === 'production';
const TELEMETRY_DB_URL = process.env.TELEMETRY_DB_URL ||
  (isProduction ? 'file:/app/data/telemetry.db' : 'file:./data/telemetry.db');
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
