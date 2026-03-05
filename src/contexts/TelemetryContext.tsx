import { createContext, useContext, ReactNode } from 'react';
import type { TelemetryClient } from '../lib/telemetry-client';
import type { TelemetryConfig } from '../types/telemetry';

/**
 * Telemetry Context
 *
 * Provides telemetry capture API to all child components.
 * Gracefully degrades to no-op functions when telemetry is not available.
 */

export interface TelemetryContextValue extends TelemetryClient {
  config: TelemetryConfig | undefined;
}

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

export interface TelemetryProviderProps {
  client: TelemetryClient;
  config: TelemetryConfig | undefined;
  children: ReactNode;
}

/**
 * Provider component
 */
export function TelemetryProvider({ client, config, children }: TelemetryProviderProps) {
  return (
    <TelemetryContext.Provider value={{ ...client, config }}>
      {children}
    </TelemetryContext.Provider>
  );
}

/**
 * Hook to access telemetry API
 *
 * Returns no-op functions when telemetry is not available (graceful degradation).
 */
export function useTelemetry(): TelemetryContextValue {
  const context = useContext(TelemetryContext);

  if (!context) {
    // Graceful degradation: return no-op functions
    return {
      capture: () => {},
      flush: () => {},
      startFieldSession: () => {},
      endFieldSession: () => {},
      updateFieldSession: () => {},
      trackValidationError: () => {},
      trackDraft: () => {},
      config: undefined,
    };
  }

  return context;
}

/**
 * Hook to check if telemetry is enabled
 */
export function useTelemetryEnabled(): boolean {
  const { config } = useTelemetry();
  return config?.enabled ?? false;
}
