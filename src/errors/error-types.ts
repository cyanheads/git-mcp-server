import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Error severity levels for categorizing errors and determining appropriate responses
 */
export const ErrorSeverity = {
  CRITICAL: 'CRITICAL', // System-level failures requiring immediate attention
  HIGH: 'HIGH',        // Operation-blocking errors that need urgent handling
  MEDIUM: 'MEDIUM',    // Non-blocking errors that should be addressed
  LOW: 'LOW'          // Minor issues that can be handled gracefully
} as const;

export type ErrorSeverityType = typeof ErrorSeverity[keyof typeof ErrorSeverity];

/**
 * Error categories for better error handling and reporting
 */
export const ErrorCategory = {
  SYSTEM: 'SYSTEM',           // System-level errors (file system, process, etc.)
  VALIDATION: 'VALIDATION',   // Input validation errors
  OPERATION: 'OPERATION',     // Git operation errors
  REPOSITORY: 'REPOSITORY',   // Repository state errors
  NETWORK: 'NETWORK',         // Network-related errors
  CONFIGURATION: 'CONFIG',    // Configuration errors
  SECURITY: 'SECURITY'        // Security-related errors
} as const;

export type ErrorCategoryType = typeof ErrorCategory[keyof typeof ErrorCategory];

/**
 * Extended error context for better error tracking and debugging
 */
export interface ErrorContext {
  operation: string;           // Operation being performed
  path?: string;              // Path being operated on
  command?: string;           // Git command being executed
  timestamp: number;          // Error occurrence timestamp
  severity: ErrorSeverityType;    // Error severity level
  category: ErrorCategoryType;    // Error category
  details?: {
    currentUsage?: number;
    threshold?: number;
    command?: string;
    exitCode?: number | string;
    stdout?: string;
    stderr?: string;
    config?: string;
    tool?: string;
    args?: unknown;
    [key: string]: unknown;
  }; // Additional error-specific details
  recoverySteps?: string[];   // Suggested recovery steps
  stackTrace?: string;        // Error stack trace
}

/**
 * Base class for all Git MCP server errors
 */
export class GitMcpError extends McpError {
  readonly severity: ErrorSeverityType;
  readonly category: ErrorCategoryType;
  readonly context: ErrorContext;

  constructor(
    code: ErrorCode,
    message: string,
    severity: ErrorSeverityType,
    category: ErrorCategoryType,
    context: Partial<ErrorContext>
  ) {
    super(code, message);
    this.name = 'GitMcpError';
    this.severity = severity;
    this.category = category;
    this.context = {
      operation: context.operation || 'unknown',
      timestamp: Date.now(),
      severity,
      category,
      ...context
    };
  }

  /**
   * Get recovery steps based on error type and context
   */
  getRecoverySteps(): string[] {
    return this.context.recoverySteps || this.getDefaultRecoverySteps();
  }

  /**
   * Get default recovery steps based on error category
   */
  private getDefaultRecoverySteps(): string[] {
    switch (this.category) {
      case ErrorCategory.SYSTEM:
        return [
          'Check system permissions and access rights',
          'Verify file system access',
          'Check available disk space',
          'Ensure required dependencies are installed'
        ];
      case ErrorCategory.VALIDATION:
        return [
          'Verify input parameters are correct',
          'Check path formatting and permissions',
          'Ensure all required fields are provided'
        ];
      case ErrorCategory.OPERATION:
        return [
          'Verify Git command syntax',
          'Check repository state',
          'Ensure working directory is clean',
          'Try running git status for more information'
        ];
      case ErrorCategory.REPOSITORY:
        return [
          'Verify repository exists and is accessible',
          'Check repository permissions',
          'Ensure .git directory is intact',
          'Try reinitializing the repository'
        ];
      case ErrorCategory.NETWORK:
        return [
          'Check network connectivity',
          'Verify remote repository access',
          'Check authentication credentials',
          'Try using git remote -v to verify remote configuration'
        ];
      case ErrorCategory.CONFIGURATION:
        return [
          'Check Git configuration',
          'Verify environment variables',
          'Ensure required settings are configured',
          'Try git config --list to view current configuration'
        ];
      case ErrorCategory.SECURITY:
        return [
          'Check file and directory permissions',
          'Verify authentication credentials',
          'Ensure secure connection to remote',
          'Review security settings'
        ];
      default:
        return [
          'Check operation parameters',
          'Verify system state',
          'Review error message details',
          'Contact support if issue persists'
        ];
    }
  }

  /**
   * Format error for logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      category: this.category,
      context: this.context,
      recoverySteps: this.getRecoverySteps(),
      stack: this.stack
    };
  }
}

/**
 * System-level errors
 */
export class SystemError extends GitMcpError {
  constructor(message: string, context: Partial<ErrorContext>) {
    super(
      ErrorCode.InternalError,
      message,
      ErrorSeverity.CRITICAL,
      ErrorCategory.SYSTEM,
      context
    );
    this.name = 'SystemError';
  }
}

/**
 * Validation errors
 */
export class ValidationError extends GitMcpError {
  constructor(message: string, context: Partial<ErrorContext>) {
    super(
      ErrorCode.InvalidParams,
      message,
      ErrorSeverity.HIGH,
      ErrorCategory.VALIDATION,
      context
    );
    this.name = 'ValidationError';
  }
}

/**
 * Git operation errors
 */
export class OperationError extends GitMcpError {
  constructor(message: string, context: Partial<ErrorContext>) {
    super(
      ErrorCode.InternalError,
      message,
      ErrorSeverity.HIGH,
      ErrorCategory.OPERATION,
      context
    );
    this.name = 'OperationError';
  }
}

/**
 * Repository state errors
 */
export class RepositoryError extends GitMcpError {
  constructor(message: string, context: Partial<ErrorContext>) {
    super(
      ErrorCode.InternalError,
      message,
      ErrorSeverity.HIGH,
      ErrorCategory.REPOSITORY,
      context
    );
    this.name = 'RepositoryError';
  }
}

/**
 * Network-related errors
 */
export class NetworkError extends GitMcpError {
  constructor(message: string, context: Partial<ErrorContext>) {
    super(
      ErrorCode.InternalError,
      message,
      ErrorSeverity.HIGH,
      ErrorCategory.NETWORK,
      context
    );
    this.name = 'NetworkError';
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends GitMcpError {
  constructor(message: string, context: Partial<ErrorContext>) {
    super(
      ErrorCode.InvalidParams,
      message,
      ErrorSeverity.MEDIUM,
      ErrorCategory.CONFIGURATION,
      context
    );
    this.name = 'ConfigurationError';
  }
}

/**
 * Security-related errors
 */
export class SecurityError extends GitMcpError {
  constructor(message: string, context: Partial<ErrorContext>) {
    super(
      ErrorCode.InternalError,
      message,
      ErrorSeverity.CRITICAL,
      ErrorCategory.SECURITY,
      context
    );
    this.name = 'SecurityError';
  }
}
