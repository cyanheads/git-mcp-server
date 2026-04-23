/**
 * @fileoverview Main ErrorHandler implementation with logging and telemetry integration.
 * @module src/utils/internal/error-handler/errorHandler
 */

import { SpanStatusCode, trace } from '@opentelemetry/api';

import { JsonRpcErrorCode, McpError } from '@/types-global/errors.js';
import { generateUUID, sanitizeInputForLogging } from '@/utils/index.js';
import { logger } from '@/utils/internal/logger.js';
import type { RequestContext } from '@/utils/internal/requestContext.js';

import { COMMON_ERROR_PATTERNS, ERROR_TYPE_MAPPINGS } from './mappings.js';
import { createSafeRegex, getErrorMessage, getErrorName } from './helpers.js';
import type { ErrorHandlerOptions, ErrorMapping } from './types.js';

/**
 * A utility class providing static methods for comprehensive error handling.
 */
export class ErrorHandler {
  /**
   * Determines an appropriate `JsonRpcErrorCode` for a given error.
   * Checks `McpError` instances, `ERROR_TYPE_MAPPINGS`, and `COMMON_ERROR_PATTERNS`.
   * Defaults to `JsonRpcErrorCode.InternalError`.
   * @param error - The error instance or value to classify.
   * @returns The determined error code.
   */
  public static determineErrorCode(error: unknown): JsonRpcErrorCode {
    if (error instanceof McpError) {
      return error.code;
    }

    const errorName = getErrorName(error);
    const errorMessage = getErrorMessage(error);

    const mappedFromType = ERROR_TYPE_MAPPINGS[errorName];
    if (mappedFromType) {
      return mappedFromType;
    }

    for (const mapping of COMMON_ERROR_PATTERNS) {
      const regex = createSafeRegex(mapping.pattern);
      if (regex.test(errorMessage) || regex.test(errorName)) {
        return mapping.errorCode;
      }
    }
    // Special-case common platform errors
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError'
    ) {
      return JsonRpcErrorCode.Timeout;
    }
    return JsonRpcErrorCode.InternalError;
  }

  /**
   * Handles an error with consistent logging and optional transformation.
   * Sanitizes input, determines error code, logs details, and can rethrow.
   * @param error - The error instance or value that occurred.
   * @param options - Configuration for handling the error.
   * @returns The handled (and potentially transformed) error instance.
   */
  public static handleError(
    error: unknown,
    options: ErrorHandlerOptions,
  ): Error {
    // --- OpenTelemetry Integration ---
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      if (error instanceof Error) {
        activeSpan.recordException(error);
      }
      activeSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    // --- End OpenTelemetry Integration ---

    const {
      context = {},
      operation,
      input,
      rethrow = false,
      errorCode: explicitErrorCode,
      includeStack = true,
      critical = false,
      errorMapper,
    } = options;

    const sanitizedInput =
      input !== undefined ? sanitizeInputForLogging(input) : undefined;
    const originalErrorName = getErrorName(error);
    const originalErrorMessage = getErrorMessage(error);
    const originalStack = error instanceof Error ? error.stack : undefined;

    let finalError: Error;
    let loggedErrorCode: JsonRpcErrorCode;

    const errorDataSeed =
      error instanceof McpError &&
      typeof error.data === 'object' &&
      error.data !== null
        ? { ...error.data }
        : {};

    const consolidatedData: Record<string, unknown> = {
      ...errorDataSeed,
      ...context,
      originalErrorName,
      originalMessage: originalErrorMessage,
    };
    if (
      originalStack &&
      !(error instanceof McpError && error.data?.originalStack)
    ) {
      consolidatedData.originalStack = originalStack;
    }

    const cause = error instanceof Error ? error : undefined;
    const rootCause = (() => {
      let current: unknown = cause;
      let depth = 0;
      while (
        current &&
        current instanceof Error &&
        current.cause &&
        depth < 5
      ) {
        current = current.cause;
        depth += 1;
      }
      return current instanceof Error
        ? { name: current.name, message: current.message }
        : undefined;
    })();
    if (rootCause) {
      consolidatedData['rootCause'] = rootCause;
    }

    if (error instanceof McpError) {
      loggedErrorCode = error.code;
      finalError = errorMapper
        ? errorMapper(error)
        : new McpError(error.code, error.message, consolidatedData, {
            cause,
          });
    } else {
      loggedErrorCode =
        explicitErrorCode || ErrorHandler.determineErrorCode(error);
      const message = `Error in ${operation}: ${originalErrorMessage}`;
      finalError = errorMapper
        ? errorMapper(error)
        : new McpError(loggedErrorCode, message, consolidatedData, {
            cause,
          });
    }

    if (
      finalError !== error &&
      error instanceof Error &&
      finalError instanceof Error &&
      !finalError.stack &&
      error.stack
    ) {
      finalError.stack = error.stack;
    }

    const logRequestId =
      typeof context.requestId === 'string' && context.requestId
        ? context.requestId
        : generateUUID();

    const logTimestamp =
      typeof context.timestamp === 'string' && context.timestamp
        ? context.timestamp
        : new Date().toISOString();

    const stack =
      finalError instanceof Error ? finalError.stack : originalStack;
    const logContext: RequestContext = {
      requestId: logRequestId,
      timestamp: logTimestamp,
      operation,
      input: sanitizedInput,
      critical,
      errorCode: loggedErrorCode,
      originalErrorType: originalErrorName,
      finalErrorType: getErrorName(finalError),
      ...Object.fromEntries(
        Object.entries(context).filter(
          ([key]) => key !== 'requestId' && key !== 'timestamp',
        ),
      ),
      errorData:
        finalError instanceof McpError && finalError.data
          ? finalError.data
          : consolidatedData,
      ...(includeStack && stack ? { stack } : {}),
    };

    logger.error(
      `Error in ${operation}: ${finalError.message || originalErrorMessage}`,
      logContext,
    );

    if (rethrow) {
      throw finalError;
    }
    return finalError;
  }

  /**
   * Maps an error to a specific error type `T` based on `ErrorMapping` rules.
   * Returns original/default error if no mapping matches.
   * @template T The target error type, extending `Error`.
   * @param error - The error instance or value to map.
   * @param mappings - An array of mapping rules to apply.
   * @param defaultFactory - Optional factory for a default error if no mapping matches.
   * @returns The mapped error of type `T`, or the original/defaulted error.
   */
  public static mapError<T extends Error>(
    error: unknown,
    mappings: ReadonlyArray<ErrorMapping<T>>,
    defaultFactory?: (error: unknown, context?: Record<string, unknown>) => T,
  ): T | Error {
    const errorMessage = getErrorMessage(error);
    const errorName = getErrorName(error);

    for (const mapping of mappings) {
      const regex = createSafeRegex(mapping.pattern);
      if (regex.test(errorMessage) || regex.test(errorName)) {
        // c8 ignore next
        return mapping.factory(error, mapping.additionalContext);
      }
    }

    if (defaultFactory) {
      return defaultFactory(error);
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  /**
   * Formats an error into a consistent object structure for API responses or structured logging.
   * @param error - The error instance or value to format.
   * @returns A structured representation of the error.
   */
  public static formatError(error: unknown): Record<string, unknown> {
    if (error instanceof McpError) {
      return {
        code: error.code,
        message: error.message,
        data:
          typeof error.data === 'object' && error.data !== null
            ? error.data
            : {},
      };
    }

    if (error instanceof Error) {
      return {
        code: ErrorHandler.determineErrorCode(error),
        message: error.message,
        data: { errorType: error.name || 'Error' },
      };
    }

    return {
      code: JsonRpcErrorCode.UnknownError,
      message: getErrorMessage(error),
      data: { errorType: getErrorName(error) },
    };
  }

  /**
   * Safely executes a function (sync or async) and handles errors using `ErrorHandler.handleError`.
   * The error is always rethrown.
   * @template T The expected return type of the function `fn`.
   * @param fn - The function to execute.
   * @param options - Error handling options (excluding `rethrow`).
   * @returns A promise resolving with the result of `fn` if successful.
   * @throws {McpError | Error} The error processed by `ErrorHandler.handleError`.
   */
  public static async tryCatch<T>(
    fn: () => Promise<T> | T,
    options: Omit<ErrorHandlerOptions, 'rethrow'>,
  ): Promise<T> {
    try {
      return await Promise.resolve(fn());
    } catch (caughtError) {
      // ErrorHandler.handleError will return the error to be thrown.
      throw ErrorHandler.handleError(caughtError, {
        ...options,
        rethrow: true,
      });
    }
  }
}
