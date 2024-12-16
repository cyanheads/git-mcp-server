import { ExecException, exec, ExecOptions } from 'child_process';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { logger } from './logger.js';
import { PathResolver } from './paths.js';

export interface CommandResult {
  stdout: string;
  stderr: string;
  command: string;
  workingDir?: string;
}

export class CommandError extends McpError {
  constructor(
    error: ExecException,
    result: Partial<CommandResult>,
    operation: string
  ) {
    const message = CommandError.formatErrorMessage(error, result);
    super(ErrorCode.InternalError, message);
    
    // Log the error with full context
    logger.error(operation, 'Command execution failed', result.workingDir, this, {
      command: result.command,
      exitCode: error.code,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }

  private static formatErrorMessage(error: ExecException, result: Partial<CommandResult>): string {
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
          reject(new CommandError(error, result, operation));
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
      if (error instanceof CommandError) {
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
