/**
 * CollaborationHarnessWithTelemetry
 *
 * Wrapper component that adds optional telemetry capture to CollaborationHarness.
 *
 * This component follows a modular design:
 * - Wraps the existing CollaborationHarness (zero modifications to core)
 * - Adds telemetry capture via React Context and DOM event listeners
 * - Completely optional (users can continue using basic CollaborationHarness)
 * - Clean separation of concerns (telemetry code in separate files)
 *
 * Usage:
 *   <CollaborationHarnessWithTelemetry
 *     roomId="checkout-42"
 *     userName="Alice"
 *     telemetryConfig={{
 *       enabled: true,
 *       piiMode: 'anonymize',
 *       captureKeystrokes: true,
 *       captureCursors: false,
 *     }}
 *   >
 *     <CheckoutForm />
 *   </CollaborationHarnessWithTelemetry>
 */

import { useId, useMemo, useRef, useEffect } from 'react';
import { CollaborationHarness } from './CollaborationHarness';
import { TelemetryProvider } from '../contexts/TelemetryContext';
import { TelemetryEventCapture } from './TelemetryEventCapture';
import { useTelemetryBuffer } from '../lib/telemetry-client';
import type { CollaborationHarnessProps } from '../types/collaboration';
import type { TelemetryConfig } from '../types/telemetry';
import { faker } from '@faker-js/faker';

export interface CollaborationHarnessWithTelemetryProps extends CollaborationHarnessProps {
  /**
   * Telemetry configuration (optional)
   *
   * Controls what data is captured and how it's processed.
   * Defaults to: { enabled: true, piiMode: 'anonymize', sampleRate: 1.0 }
   */
  telemetryConfig?: TelemetryConfig;
}

export function CollaborationHarnessWithTelemetry({
  telemetryConfig,
  children,
  ...harnessProps
}: CollaborationHarnessWithTelemetryProps) {
  // Generate unique session ID
  const sessionId = useId();

  // Generate a readable default name using faker if none provided
  const defaultUserName = useMemo(() => {
    if (harnessProps.userName) return harnessProps.userName;
    // Check localStorage for saved name
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('userName');
      if (saved) return saved;
    }
    // Generate a readable name
    return faker.person.firstName();
  }, [harnessProps.userName]);

  // User ID from props (or generate a stable unique ID)
  const userId = useMemo(() => {
    // Check localStorage for saved userId
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('userId');
      if (saved) return saved;
      // Generate and save a new ID
      const newId = `user_${Math.random().toString(36).substring(2, 11)}`;
      localStorage.setItem('userId', newId);
      return newId;
    }
    return `user_${Math.random().toString(36).substring(2, 11)}`;
  }, []);

  // Reference to WebSocket (will be populated by CollaborationHarness)
  const socketRef = useRef<WebSocket | null>(null);

  // Merge telemetry config with defaults
  const config: TelemetryConfig = useMemo(
    () => ({
      enabled: true,
      sampleRate: 1.0,
      piiMode: 'anonymize',
      captureKeystrokes: true,
      captureCursors: false,
      ...telemetryConfig,
    }),
    [telemetryConfig]
  );

  // Initialize telemetry buffer
  const telemetryClient = useTelemetryBuffer({
    sessionId,
    userId,
    userName: defaultUserName,
    socketRef,
    ...config,
  });

  // HACK: Access WebSocket from CollaborationHarness
  // This is a workaround since we're not modifying the core harness.
  // In production, you might want to expose the socket via context or ref.
  useEffect(() => {
    console.log('[Telemetry] Looking for WebSocket...');

    // Try to find the WebSocket instance
    // This is fragile but works for the wrapper pattern
    const checkForSocket = setInterval(() => {
      // Access the WebSocket from the global window (if available)
      // Or use a more sophisticated approach like exposing via context
      const ws = (window as any).__collabSocket__;
      if (ws) {
        console.log('[Telemetry] Found WebSocket, readyState:', ws.readyState);
        if (ws.readyState === WebSocket.OPEN) {
          socketRef.current = ws;
          console.log('[Telemetry] WebSocket connected and assigned to socketRef');
          clearInterval(checkForSocket);
        }
      }
    }, 100);

    return () => clearInterval(checkForSocket);
  }, []);

  // If telemetry is disabled, just render the basic harness
  if (!config.enabled) {
    return (
      <CollaborationHarness {...harnessProps} userName={defaultUserName}>
        {children}
      </CollaborationHarness>
    );
  }

  // Render with telemetry
  return (
    <CollaborationHarness {...harnessProps} userName={defaultUserName}>
      <TelemetryProvider client={telemetryClient} config={config}>
        <TelemetryEventCapture>{children}</TelemetryEventCapture>
      </TelemetryProvider>
    </CollaborationHarness>
  );
}

/**
 * Progressive adoption helper
 *
 * Use this to enable telemetry based on environment variable:
 *
 * Example:
 *   const Wrapper = getTelemetryWrapper();
 *   <Wrapper {...props}>
 *     <CheckoutForm />
 *   </Wrapper>
 */
export function getTelemetryWrapper() {
  const telemetryEnabled = import.meta.env.VITE_TELEMETRY_ENABLED === 'true';
  return telemetryEnabled ? CollaborationHarnessWithTelemetry : CollaborationHarness;
}
