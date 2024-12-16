import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { resolve, relative } from 'path';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  operation: string;
  message: string;
  path?: string;
  error?: Error;
  context?: Record<string, any>;
}

export class Logger {
  private static instance: Logger;
  private entries: LogEntry[] = [];
  private readonly cwd: string;

  private constructor() {
    this.cwd = process.cwd();
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private formatPath(path: string): string {
    const absolutePath = resolve(this.cwd, path);
    return relative(this.cwd, absolutePath);
  }

  private createEntry(
    level: LogLevel,
    operation: string,
    message: string,
    path?: string,
    error?: Error,
    context?: Record<string, any>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      operation,
      message,
      path: path ? this.formatPath(path) : undefined,
      error,
      context,
    };
  }

  private log(entry: LogEntry): void {
    this.entries.push(entry);
    let logMessage = `[${entry.timestamp}] ${entry.level} - ${entry.operation}: ${entry.message}`;
    
    if (entry.path) {
      logMessage += `\n  Path: ${entry.path}`;
    }
    
    if (entry.context) {
      logMessage += `\n  Context: ${JSON.stringify(entry.context, null, 2)}`;
    }
    
    if (entry.error) {
      if (entry.error instanceof McpError) {
        logMessage += `\n  Error: ${entry.error.message}`;
      } else {
        logMessage += `\n  Error: ${entry.error.stack || entry.error.message}`;
      }
    }

    console.error(logMessage);
  }

  debug(operation: string, message: string, path?: string, context?: Record<string, any>): void {
    this.log(this.createEntry(LogLevel.DEBUG, operation, message, path, undefined, context));
  }

  info(operation: string, message: string, path?: string, context?: Record<string, any>): void {
    this.log(this.createEntry(LogLevel.INFO, operation, message, path, undefined, context));
  }

  warn(operation: string, message: string, path?: string, error?: Error, context?: Record<string, any>): void {
    this.log(this.createEntry(LogLevel.WARN, operation, message, path, error, context));
  }

  error(operation: string, message: string, path?: string, error?: Error, context?: Record<string, any>): void {
    this.log(this.createEntry(LogLevel.ERROR, operation, message, path, error, context));
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  getEntriesForOperation(operation: string): LogEntry[] {
    return this.entries.filter(entry => entry.operation === operation);
  }

  getEntriesForPath(path: string): LogEntry[] {
    const searchPath = this.formatPath(path);
    return this.entries.filter(entry => entry.path === searchPath);
  }

  clear(): void {
    this.entries = [];
  }

  // Helper methods for common operations
  logCommand(operation: string, command: string, path?: string, context?: Record<string, any>): void {
    this.debug(operation, `Executing command: ${command}`, path, context);
  }

  logCommandResult(operation: string, result: string, path?: string, context?: Record<string, any>): void {
    this.debug(operation, `Command result: ${result}`, path, context);
  }

  logPathValidation(operation: string, path: string, context?: Record<string, any>): void {
    this.debug(operation, `Validating path: ${path}`, path, context);
  }

  logGitOperation(operation: string, details: string, path?: string, context?: Record<string, any>): void {
    this.info(operation, details, path, context);
  }

  logError(operation: string, error: Error, path?: string, context?: Record<string, any>): void {
    this.error(operation, 'Operation failed', path, error, context);
  }
}

// Export a singleton instance
export const logger = Logger.getInstance();
