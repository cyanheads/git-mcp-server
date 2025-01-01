import { ExecException, exec, ExecOptions } from 'child_process';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { logger } from './logger.js';
import { PathResolver } from './paths.js';
import { ErrorHandler } from '../errors/error-handler.js';
import { ErrorCategory, ErrorSeverity, GitMcpError } from '../errors/error-types.js';

export interface CommandResult {
  stdout: string;
  stderr: string;
  command: string;
  workingDir?: string;
}

/**
 * Formats a command error message with detailed context
 */
function formatCommandError(error: ExecException, result: Partial<CommandResult>): string {
  let message = `Command failed with exit code ${error.code}`;
  
  if (result.command) {
    message += `\nCommand: ${result.command}`;
  }
  
  if (result.workingDir) {
    message += `\nWorking Directory: ${result.workingDir}`;
  }
  
  if (result.stdout) {
    message += `\nOutput: ${result.stdout}`;
  }
  
  if (result.stderr) {
    message += `\nError: ${result.stderr}`;
  }
  
  return message;
}

/**
 * Creates a command error with appropriate category and severity
 */
function createCommandError(
  error: ExecException,
  result: Partial<CommandResult>,
  operation: string
): GitMcpError {
  const message = formatCommandError(error, result);
  const context = {
    operation,
    path: result.workingDir,
    command: result.command,
    details: {
      exitCode: error.code,
      stdout: result.stdout,
      stderr: result.stderr
    }
  };

  // Determine error category and severity based on error code and context
  const errorCode = error.code?.toString() || '';

  // System errors
  if (errorCode === 'ENOENT') {
    return ErrorHandler.handleSystemError(error, context);
  }

  // Security errors
  if (errorCode === 'EACCES') {
    return ErrorHandler.handleSecurityError(error, context);
  }

  // Validation errors
  if (errorCode === 'ENOTDIR' || errorCode === 'ENOTEMPTY') {
    return ErrorHandler.handleValidationError(error, context);
  }

  // Git-specific error codes
  const numericCode = typeof error.code === 'number' ? error.code : 
                     typeof error.code === 'string' ? parseInt(error.code, 10) : 
                     null;
  
  if (numericCode !== null) {
    switch (numericCode) {
      case 128: // Repository not found or invalid
        return ErrorHandler.handleRepositoryError(error, context);
      case 129: // Invalid command or argument
        return ErrorHandler.handleValidationError(error, context);
      case 130: // User interrupt
        return ErrorHandler.handleOperationError(error, context);
      default:
        return ErrorHandler.handleOperationError(error, context);
    }
  }

  // Default to operation error for unknown cases
  return ErrorHandler.handleOperationError(error, context);
}

export class CommandExecutor {
  static async execute(
    command: string,
    operation: string,
    workingDir?: string,
    options: ExecOptions = {}
  ): Promise<CommandResult> {
    // Validate and resolve working directory if provided
    if (workingDir) {
      const pathInfo = PathResolver.validatePath(workingDir, operation, {
        mustExist: true,
        mustBeDirectory: true,
      });
      workingDir = pathInfo.absolute;
    }

    // Log command execution
    logger.logCommand(operation, command, workingDir);

    // Prepare execution options
    const execOptions: ExecOptions = {
      ...options,
      cwd: workingDir,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    };

    return new Promise((resolve, reject) => {
      exec(command, execOptions, (error, stdout, stderr) => {
        const result: CommandResult = {
          command,
          workingDir,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        };

        // Log command result
        if (error) {
          reject(createCommandError(error, result, operation));
          return;
        }

        logger.logCommandResult(operation, result.stdout, workingDir, {
          stderr: result.stderr,
        });
        resolve(result);
      });
    });
  }

  static formatOutput(result: CommandResult): string {
    let output = '';
    
    if (result.stdout) {
      output += result.stdout;
    }
    
    if (result.stderr) {
      if (output) output += '\n';
      output += result.stderr;
    }
    
    return output.trim();
  }

  static async executeGitCommand(
    command: string,
    operation: string,
    workingDir?: string,
    options: ExecOptions = {}
  ): Promise<CommandResult> {
    // Add git environment variables
    const gitOptions: ExecOptions = {
      ...options,
      env: {
        ...process.env,
        ...options.env,
        GIT_TERMINAL_PROMPT: '0', // Disable git terminal prompts
        GIT_ASKPASS: 'echo', // Prevent password prompts
      },
    };

    try {
      return await this.execute(`git ${command}`, operation, workingDir, gitOptions);
    } catch (error) {
      if (error instanceof GitMcpError) {
        // Add git-specific context to error
        logger.error(operation, 'Git command failed', workingDir, error, {
          command: `git ${command}`,
          gitConfig: await this.execute('git config --list', operation, workingDir)
            .then(result => result.stdout)
            .catch(() => 'Unable to get git config'),
        });
      }
      throw error;
    }
  }

  static async validateGitInstallation(operation: string): Promise<void> {
    try {
      const result = await this.execute('git --version', operation);
      logger.info(operation, 'Git installation validated', undefined, {
        version: result.stdout,
      });
    } catch (error) {
      const mcpError = new McpError(
        ErrorCode.InternalError,
        'Git is not installed or not accessible'
      );
      logger.error(operation, 'Git installation validation failed', undefined, mcpError);
      throw mcpError;
    }
  }
}
