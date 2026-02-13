/**
 * @fileoverview Manages stateful HTTP sessions for MCP protocol.
 * Tracks session creation, expiry, and cleanup according to MCP spec 2025-06-18.
 *
 * Per MCP Specification:
 * - Servers MAY assign session IDs during initialization
 * - Servers MAY terminate sessions at any time
 * - Servers MUST respond with 404 when session has expired
 * - Clients MUST start new session on 404 by sending new InitializeRequest
 *
 * @see {@link https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#session-management | MCP Session Management}
 * @module src/mcp-server/transports/http/sessionManager
 */
import { logger, requestContextService } from '@/utils/index.js';

/**
 * Metadata tracked for each HTTP session.
 */
interface SessionMetadata {
  /** Unique session identifier */
  sessionId: string;
  /** Timestamp when session was created (milliseconds since epoch) */
  createdAt: number;
  /** Timestamp of last activity (milliseconds since epoch) */
  lastActivityAt: number;
  /** Optional client identifier from auth context */
  clientId?: string;
  /** Optional tenant identifier from auth context */
  tenantId?: string;
}

/**
 * Manages MCP HTTP session lifecycle including creation, tracking, expiry, and cleanup.
 *
 * Features:
 * - Automatic session expiry based on configurable timeout
 * - Background cleanup of stale sessions
 * - Thread-safe session operations
 * - Activity tracking for idle timeout
 *
 * @example
 * ```typescript
 * const manager = SessionManager.getInstance();
 *
 * // Create new session
 * const sessionId = manager.createSession('client-123', 'tenant-456');
 *
 * // Check if session is valid
 * if (manager.isSessionValid(sessionId)) {
 *   manager.touchSession(sessionId); // Update activity timestamp
 * }
 *
 * // Explicitly terminate session
 * manager.terminateSession(sessionId);
 * ```
 */
export class SessionManager {
  private static instance: SessionManager | null = null;
  private sessions: Map<string, SessionMetadata> = new Map();
  private cleanupIntervalId: NodeJS.Timeout | null = null;
  private staleTimeoutMs: number;
  private cleanupIntervalMs: number;

  /**
   * Optional callback invoked when a session expires due to inactivity.
   * Used by the HTTP transport to clean up per-session resources (transports, servers).
   */
  public onSessionExpired: ((sessionId: string) => void) | null = null;

  /**
   * Private constructor - use getInstance() instead.
   *
   * @param staleTimeoutMs - Session expiry timeout in milliseconds (default: 30 minutes)
   * @param cleanupIntervalMs - How often to run cleanup (default: 5 minutes)
   */
  private constructor(
    staleTimeoutMs = 30 * 60 * 1000, // 30 minutes
    cleanupIntervalMs = 5 * 60 * 1000, // 5 minutes
  ) {
    this.staleTimeoutMs = staleTimeoutMs;
    this.cleanupIntervalMs = cleanupIntervalMs;
    this.startCleanupInterval();
  }

  /**
   * Gets the singleton SessionManager instance.
   *
   * @param staleTimeoutMs - Session expiry timeout (only used on first call)
   * @param cleanupIntervalMs - Cleanup interval (only used on first call)
   * @returns The SessionManager singleton
   */
  public static getInstance(
    staleTimeoutMs?: number,
    cleanupIntervalMs?: number,
  ): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager(
        staleTimeoutMs,
        cleanupIntervalMs,
      );
    }
    return SessionManager.instance;
  }

  /**
   * Resets the singleton instance. Useful for testing.
   * Stops cleanup interval if running.
   */
  public static resetInstance(): void {
    if (SessionManager.instance) {
      SessionManager.instance.stopCleanupInterval();
      SessionManager.instance = null;
    }
  }

  /**
   * Creates a new session and stores its metadata.
   *
   * @param sessionId - Unique session identifier
   * @param clientId - Optional client identifier from auth
   * @param tenantId - Optional tenant identifier from auth
   * @returns The created session ID
   */
  public createSession(
    sessionId: string,
    clientId?: string,
    tenantId?: string,
  ): string {
    const now = Date.now();
    const metadata: SessionMetadata = {
      sessionId,
      createdAt: now,
      lastActivityAt: now,
      ...(clientId !== undefined && { clientId }),
      ...(tenantId !== undefined && { tenantId }),
    };

    this.sessions.set(sessionId, metadata);

    logger.debug('Created new MCP session', {
      ...requestContextService.createRequestContext({
        operation: 'SessionManager.createSession',
      }),
      sessionId,
      ...(clientId !== undefined && { clientId }),
      ...(tenantId !== undefined && { tenantId }),
      totalSessions: this.sessions.size,
    });

    return sessionId;
  }

  /**
   * Checks if a session exists and has not expired.
   *
   * @param sessionId - Session identifier to check
   * @returns True if session exists and is not stale
   */
  public isSessionValid(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const now = Date.now();
    const age = now - session.lastActivityAt;

    // Session is stale if no activity within timeout window
    if (age > this.staleTimeoutMs) {
      logger.info('Session expired due to inactivity', {
        ...requestContextService.createRequestContext({
          operation: 'SessionManager.isSessionValid',
        }),
        sessionId,
        ageMs: age,
        staleTimeoutMs: this.staleTimeoutMs,
      });
      this.sessions.delete(sessionId);
      this.onSessionExpired?.(sessionId);
      return false;
    }

    return true;
  }

  /**
   * Updates the last activity timestamp for a session.
   * This prevents the session from expiring due to idle timeout.
   *
   * @param sessionId - Session identifier to update
   */
  public touchSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = Date.now();
    }
  }

  /**
   * Explicitly terminates a session and removes it from tracking.
   * Use this when client sends DELETE request or server wants to force logout.
   *
   * @param sessionId - Session identifier to terminate
   * @returns True if session was found and terminated, false if not found
   */
  public terminateSession(sessionId: string): boolean {
    const existed = this.sessions.has(sessionId);
    this.sessions.delete(sessionId);

    if (existed) {
      logger.info('Session explicitly terminated', {
        ...requestContextService.createRequestContext({
          operation: 'SessionManager.terminateSession',
        }),
        sessionId,
        remainingSessions: this.sessions.size,
      });
    }

    return existed;
  }

  /**
   * Gets metadata for a session if it exists and is valid.
   *
   * @param sessionId - Session identifier
   * @returns Session metadata or null if session invalid/missing
   */
  public getSessionMetadata(sessionId: string): SessionMetadata | null {
    if (!this.isSessionValid(sessionId)) {
      return null;
    }
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Gets the total number of active sessions.
   *
   * @returns Number of sessions currently tracked
   */
  public getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Starts the background cleanup interval that periodically removes stale sessions.
   */
  private startCleanupInterval(): void {
    if (this.cleanupIntervalId) {
      return; // Already running
    }

    this.cleanupIntervalId = setInterval(() => {
      this.cleanupStaleSessions();
    }, this.cleanupIntervalMs);

    logger.info('Session cleanup interval started', {
      ...requestContextService.createRequestContext({
        operation: 'SessionManager.startCleanupInterval',
      }),
      cleanupIntervalMs: this.cleanupIntervalMs,
      staleTimeoutMs: this.staleTimeoutMs,
    });
  }

  /**
   * Stops the background cleanup interval.
   * Should be called during graceful shutdown.
   */
  public stopCleanupInterval(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
      logger.info('Session cleanup interval stopped', {
        ...requestContextService.createRequestContext({
          operation: 'SessionManager.stopCleanupInterval',
        }),
      });
    }
  }

  /**
   * Removes all stale sessions from tracking.
   * Called periodically by the cleanup interval.
   */
  private cleanupStaleSessions(): void {
    const now = Date.now();
    const sessionsBefore = this.sessions.size;
    let removedCount = 0;

    for (const [sessionId, metadata] of this.sessions.entries()) {
      const age = now - metadata.lastActivityAt;
      if (age > this.staleTimeoutMs) {
        this.sessions.delete(sessionId);
        this.onSessionExpired?.(sessionId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.notice('Cleaned up stale sessions', {
        ...requestContextService.createRequestContext({
          operation: 'SessionManager.cleanupStaleSessions',
        }),
        removedCount,
        sessionsBefore,
        sessionsAfter: this.sessions.size,
      });
    }
  }

  /**
   * Removes all sessions. Useful for testing or emergency cleanup.
   */
  public clearAllSessions(): void {
    const count = this.sessions.size;
    this.sessions.clear();
    logger.warning('All sessions cleared', {
      ...requestContextService.createRequestContext({
        operation: 'SessionManager.clearAllSessions',
      }),
      clearedCount: count,
    });
  }
}
