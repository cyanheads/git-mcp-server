/**
 * @fileoverview Utility for displaying startup banners in TTY environments.
 * Provides a centralized way to show user-facing messages during server initialization
 * while preventing output pollution in non-interactive environments (CI, pipes, STDIO transport).
 * @module src/utils/internal/startupBanner
 */

/**
 * Displays a startup banner message to the console only if running in a TTY environment.
 * This prevents polluting STDIO transport, piped output, or CI/CD logs.
 *
 * In STDIO mode, the banner is written to stderr to avoid polluting stdout, which is
 * reserved for MCP JSON-RPC protocol messages.
 *
 * @param message - The banner message to display
 * @param transportType - The transport type ('stdio' or 'http'). If 'stdio', uses stderr.
 * @example
 * ```typescript
 * logStartupBanner('🚀 MCP Server running at: http://localhost:3015', 'http');
 * logStartupBanner('🚀 MCP Server running in STDIO mode', 'stdio');
 * ```
 */
export function logStartupBanner(
  message: string,
  transportType?: 'stdio' | 'http',
): void {
  if (process.stdout.isTTY) {
    // In STDIO mode, use stderr to avoid polluting stdout (which is reserved for MCP JSON-RPC)
    if (transportType === 'stdio') {
      console.error(message);
    } else {
      console.log(message);
    }
  }
}
