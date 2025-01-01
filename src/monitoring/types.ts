import { GitMcpError } from '../errors/error-types.js';
import { ErrorCategory, ErrorSeverity } from '../errors/error-types.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Performance monitoring types
 */

/**
 * Performance error context
 */
export interface PerformanceErrorContext {
  currentUsage?: number;
  threshold?: number;
  operation?: string;
  details?: Record<string, any>;
  [key: string]: unknown;  // Index signature for additional properties
}

/**
 * Performance error with context
 */
export class PerformanceError extends GitMcpError {
  constructor(
    message: string,
    context: PerformanceErrorContext
  ) {
    super(
      ErrorCode.InternalError,
      message,
      ErrorSeverity.HIGH,
      ErrorCategory.SYSTEM,
      {
        operation: context.operation || 'performance',
        timestamp: Date.now(),
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.SYSTEM,
        details: context
      }
    );
    this.name = 'PerformanceError';
  }
}
