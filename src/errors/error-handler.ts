import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  ErrorCategory,
  ErrorSeverity,
  ErrorCategoryType,
  ErrorSeverityType,
  GitMcpError,
  ErrorContext
} from './error-types.js';
import { logger } from '../utils/logger.js';

/**
 * Maps error categories to appropriate MCP error codes
 */
function getMcpErrorCode(category: ErrorCategoryType, severity: ErrorSeverityType): ErrorCode {
  switch (category) {
    case ErrorCategory.VALIDATION:
      return ErrorCode.InvalidParams;
    case ErrorCategory.SYSTEM:
    case ErrorCategory.OPERATION:
    case ErrorCategory.NETWORK:
    case ErrorCategory.SECURITY:
      return ErrorCode.InternalError;
    case ErrorCategory.REPOSITORY:
      // For repository state errors, use InvalidParams if it's a configuration issue,
      // otherwise use InternalError
      return severity === ErrorSeverity.MEDIUM ? ErrorCode.InvalidParams : ErrorCode.InternalError;
    case ErrorCategory.CONFIGURATION:
      return ErrorCode.InvalidParams;
    default:
      return ErrorCode.InternalError;
  }
}

/**
 * Handles and logs errors with appropriate context and recovery steps
 */
export class ErrorHandler {
  /**
   * Creates a GitMcpError with appropriate context and logs it
   */
  static handleError(
    error: Error | GitMcpError,
    category: ErrorCategoryType,
    severity: ErrorSeverityType,
    context: Partial<ErrorContext>
  ): GitMcpError {
    // If it's already a GitMcpError, just log and return it
    if (error instanceof GitMcpError) {
      this.logError(error);
      return error;
    }

    // Create new GitMcpError with context
    const errorContext: Partial<ErrorContext> = {
      ...context,
      stackTrace: error.stack,
      timestamp: Date.now()
    };

    const gitError = new GitMcpError(
      getMcpErrorCode(category, severity),
      error.message,
      severity,
      category,
      errorContext
    );

    this.logError(gitError);
    return gitError;
  }

  /**
   * Logs error with full context and recovery steps
   */
  private static logError(error: GitMcpError): void {
    const errorInfo = {
      name: error.name,
      message: error.message,
      severity: error.severity,
      category: error.category,
      context: error.context,
      recoverySteps: error.getRecoverySteps()
    };

    // Log based on severity
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error(
          error.context.operation,
          `CRITICAL: ${error.message}`,
          error.context.path,
          error,
          errorInfo
        );
        break;
      case ErrorSeverity.HIGH:
        logger.error(
          error.context.operation,
          `HIGH: ${error.message}`,
          error.context.path,
          error,
          errorInfo
        );
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn(
          error.context.operation,
          `MEDIUM: ${error.message}`,
          error.context.path,
          error,
          errorInfo
        );
        break;
      case ErrorSeverity.LOW:
        logger.warn(
          error.context.operation,
          `LOW: ${error.message}`,
          error.context.path,
          error,
          errorInfo
        );
        break;
    }
  }

  /**
   * Creates and handles a system error
   */
  static handleSystemError(error: Error, context: Partial<ErrorContext>): GitMcpError {
    return this.handleError(error, ErrorCategory.SYSTEM, ErrorSeverity.CRITICAL, context);
  }

  /**
   * Creates and handles a validation error
   */
  static handleValidationError(error: Error, context: Partial<ErrorContext>): GitMcpError {
    return this.handleError(error, ErrorCategory.VALIDATION, ErrorSeverity.HIGH, context);
  }

  /**
   * Creates and handles an operation error
   */
  static handleOperationError(error: Error, context: Partial<ErrorContext>): GitMcpError {
    return this.handleError(error, ErrorCategory.OPERATION, ErrorSeverity.HIGH, context);
  }

  /**
   * Creates and handles a repository error
   */
  static handleRepositoryError(error: Error, context: Partial<ErrorContext>): GitMcpError {
    return this.handleError(error, ErrorCategory.REPOSITORY, ErrorSeverity.HIGH, context);
  }

  /**
   * Creates and handles a network error
   */
  static handleNetworkError(error: Error, context: Partial<ErrorContext>): GitMcpError {
    return this.handleError(error, ErrorCategory.NETWORK, ErrorSeverity.HIGH, context);
  }

  /**
   * Creates and handles a configuration error
   */
  static handleConfigError(error: Error, context: Partial<ErrorContext>): GitMcpError {
    return this.handleError(error, ErrorCategory.CONFIGURATION, ErrorSeverity.MEDIUM, context);
  }

  /**
   * Creates and handles a security error
   */
  static handleSecurityError(error: Error, context: Partial<ErrorContext>): GitMcpError {
    return this.handleError(error, ErrorCategory.SECURITY, ErrorSeverity.CRITICAL, context);
  }

  /**
   * Determines if an error is retryable based on its category and severity
   */
  static isRetryable(error: GitMcpError): boolean {
    // Never retry validation or security errors
    if (
      error.category === ErrorCategory.VALIDATION ||
      error.category === ErrorCategory.SECURITY ||
      error.severity === ErrorSeverity.CRITICAL
    ) {
      return false;
    }

    // Network errors are usually retryable
    if (error.category === ErrorCategory.NETWORK) {
      return true;
    }

    // Repository and operation errors are retryable for non-critical severities
    if (
      (error.category === ErrorCategory.REPOSITORY ||
       error.category === ErrorCategory.OPERATION) &&
      [ErrorSeverity.HIGH, ErrorSeverity.MEDIUM, ErrorSeverity.LOW].includes(error.severity as any)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Gets suggested retry delay in milliseconds based on error type
   */
  static getRetryDelay(error: GitMcpError): number {
    if (!this.isRetryable(error)) {
      return 0;
    }

    switch (error.category) {
      case ErrorCategory.NETWORK:
        return 1000; // 1 second for network issues
      case ErrorCategory.REPOSITORY:
        return 500;  // 500ms for repository issues
      case ErrorCategory.OPERATION:
        return 200;  // 200ms for operation issues
      default:
        return 1000; // Default 1 second
    }
  }
}
