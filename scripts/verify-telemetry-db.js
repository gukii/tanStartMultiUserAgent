/**
 * Telemetry Database Verification Script
 *
 * Verifies that the telemetry database is set up correctly and shows sample queries.
 */

import { createClient } from '@libsql/client';

const DB_URL = process.env.TELEMETRY_DB_URL || 'file:./data/telemetry.db';

const client = createClient({ url: DB_URL });

async function verifyDatabase() {
  console.log('🔍 Verifying telemetry database...\n');

  try {
    // Check if database file exists
    console.log('📦 Database URL:', DB_URL);

    // List all tables
    const tables = await client.execute(`
      SELECT name FROM sqlite_master
      WHERE type='table'
      ORDER BY name;
    `);

    console.log('\n📊 Tables found:');
    tables.rows.forEach((row) => {
      console.log(`  - ${row.name}`);
    });

    // Count records in each table
    const telemetryTables = [
      'telemetry_sessions',
      'telemetry_participants',
      'telemetry_interactions',
      'telemetry_field_sessions',
      'telemetry_keystroke_sequences',
      'telemetry_cursor_movements',
      'telemetry_validation_events',
      'telemetry_ai_interactions',
      'telemetry_conflict_events',
      'telemetry_performance_metrics',
    ];

    console.log('\n📈 Record counts:');
    for (const table of telemetryTables) {
      try {
        const result = await client.execute(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`  ${table}: ${result.rows[0].count} records`);
      } catch (error) {
        console.log(`  ${table}: ERROR - ${error.message}`);
      }
    }

    // Show recent sessions (if any)
    const sessions = await client.execute(`
      SELECT
        id,
        room_id,
        route,
        started_at,
        total_participants,
        total_interactions
      FROM telemetry_sessions
      ORDER BY started_at DESC
      LIMIT 5
    `);

    if (sessions.rows.length > 0) {
      console.log('\n📅 Recent sessions:');
      sessions.rows.forEach((row) => {
        console.log(`  - ${row.id} (${row.route}) - ${row.total_participants} participants, ${row.total_interactions} interactions`);
      });
    } else {
      console.log('\n📅 No sessions recorded yet');
    }

    console.log('\n✅ Database verification complete!');

  } catch (error) {
    console.error('\n❌ Error verifying database:', error);
    process.exit(1);
  }
}

verifyDatabase();
