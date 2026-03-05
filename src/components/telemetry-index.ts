/**
 * Telemetry Module Exports
 *
 * Central export file for all telemetry-related components and utilities.
 */

// Components
export { CollaborationHarnessWithTelemetry, getTelemetryWrapper } from './CollaborationHarnessWithTelemetry';
export { TelemetryEventCapture } from './TelemetryEventCapture';

// Context
export { TelemetryProvider, useTelemetry, useTelemetryEnabled } from '../contexts/TelemetryContext';

// Hooks & Utilities
export { useTelemetryBuffer } from '../lib/telemetry-client';
export { TelemetryBuffer } from '../lib/telemetry-buffer';

// Types
export type {
  TelemetryConfig,
  TelemetryEvent,
  PiiMode,
  EventCategory,
  EventType,
  FieldSessionData,
  EnvironmentData,
  TelemetryBatchMessage,
  TelemetryAckMessage,
} from '../types/telemetry';
