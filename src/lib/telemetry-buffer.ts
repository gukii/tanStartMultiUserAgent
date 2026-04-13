import type { TelemetryEvent, TelemetryConfig } from '../types/telemetry';

/**
 * Telemetry Event Buffer
 *
 * Batches telemetry events for efficient transmission to the server.
 * Features:
 * - Automatic flushing (100 events or 5 seconds)
 * - Page unload handling (via sendBeacon)
 * - Throttling for high-frequency events
 * - Sequence ID tracking for deduplication
 */

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_FLUSH_INTERVAL = 5000; // 5 seconds

export interface TelemetryBufferOptions {
  enabled?: boolean;
  sampleRate?: number;
  batchSize?: number;
  flushInterval?: number;
  onFlush?: (events: TelemetryEvent[], sequenceId: number) => void;
}

export class TelemetryBuffer {
  private buffer: TelemetryEvent[] = [];
  private sequenceId = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastFlushTime = Date.now();
  private throttleTimers: Map<string, number> = new Map();

  private enabled: boolean;
  private sampleRate: number;
  private batchSize: number;
  private flushInterval: number;
  private onFlush?: (events: TelemetryEvent[], sequenceId: number) => void;

  // Throttle configuration (ms)
  private throttleConfig: Record<string, number> = {
    cursor_move: 200,
    scroll: 500,
    performance_sample: 10000,
  };

  constructor(options: TelemetryBufferOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.sampleRate = options.sampleRate ?? 1.0;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.flushInterval = options.flushInterval ?? DEFAULT_FLUSH_INTERVAL;
    this.onFlush = options.onFlush;

    // Set up page unload handler
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handleUnload);
      window.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    // Start flush timer
    this.scheduleFlush();
  }

  /**
   * Add event to buffer (with throttling)
   */
  capture(event: TelemetryEvent): void {
    if (!this.enabled) return;

    // Sample rate check
    if (this.sampleRate < 1.0 && Math.random() > this.sampleRate) {
      return;
    }

    // Apply throttling for high-frequency events
    if (this.shouldThrottle(event.eventType)) {
      return;
    }

    // Add sequence ID
    const eventWithSequence = {
      ...event,
      sequenceId: this.sequenceId++,
    };

    this.buffer.push(eventWithSequence);

    // Flush if buffer is full
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Check if event should be throttled
   */
  private shouldThrottle(eventType: string): boolean {
    const throttleMs = this.throttleConfig[eventType];
    if (!throttleMs) return false;

    const now = Date.now();
    const lastTime = this.throttleTimers.get(eventType);

    if (lastTime && now - lastTime < throttleMs) {
      return true; // Throttle this event
    }

    this.throttleTimers.set(eventType, now);
    return false;
  }

  /**
   * Manually flush buffer
   */
  flush(): void {
    if (this.buffer.length === 0) return;

    const events = this.buffer.splice(0);
    const batchSequenceId = this.sequenceId;

    try {
      this.onFlush?.(events, batchSequenceId);
    } catch (error) {
      console.error('[Telemetry] Flush error:', error);
    }

    this.lastFlushTime = Date.now();
    this.scheduleFlush();
  }

  /**
   * Schedule next automatic flush
   */
  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = setTimeout(() => {
      this.flush();
    }, this.flushInterval);
  }

  /**
   * Handle page unload (send remaining events via beacon)
   */
  private handleUnload = (): void => {
    if (this.buffer.length === 0) return;

    // Use sendBeacon for reliable delivery during page unload
    if (navigator.sendBeacon) {
      const events = this.buffer.splice(0);
      const payload = JSON.stringify({
        type: 'TELEMETRY_BATCH',
        events,
        sequenceId: this.sequenceId,
      });

      // Send to telemetry endpoint
      const endpoint = `${window.location.origin}/api/telemetry`;
      navigator.sendBeacon(endpoint, payload);
    }
  };

  /**
   * Handle visibility change (flush when page becomes hidden)
   */
  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      this.flush();
    }
  };

  /**
   * Get current buffer size
   */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Clear buffer without flushing
   */
  clear(): void {
    this.buffer = [];
  }

  /**
   * Update configuration
   */
  updateConfig(options: Partial<TelemetryBufferOptions>): void {
    if (options.enabled !== undefined) this.enabled = options.enabled;
    if (options.sampleRate !== undefined) this.sampleRate = options.sampleRate;
    if (options.batchSize !== undefined) this.batchSize = options.batchSize;
    if (options.flushInterval !== undefined) {
      this.flushInterval = options.flushInterval;
      this.scheduleFlush(); // Restart timer with new interval
    }
  }

  /**
   * Cleanup (remove event listeners, clear timer)
   */
  destroy(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.handleUnload);
      window.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }

    this.flush(); // Final flush
    this.buffer = [];
  }
}
