/**
 * Provides a fluent interface for building Git commands with proper option handling
 */
export class GitCommandBuilder {
  private command: string[] = ['git'];
  private options: Map<string, string | boolean> = new Map();

  /**
   * Create a new GitCommandBuilder for a specific Git command
   */
  constructor(command: string) {
    this.command.push(command);
  }

  /**
   * Add a positional argument to the command
   */
  arg(value: string): this {
    this.command.push(this.escapeArg(value));
    return this;
  }

  /**
   * Add multiple positional arguments
   */
  args(...values: string[]): this {
    values.forEach(value => this.arg(value));
    return this;
  }

  /**
   * Add a flag option (--flag)
   */
  flag(name: string): this {
    this.options.set(name, true);
    return this;
  }

  /**
   * Add a value option (--option=value)
   */
  option(name: string, value: string): this {
    this.options.set(name, value);
    return this;
  }

  /**
   * Add a force flag (--force)
   */
  withForce(): this {
    return this.flag('force');
  }

  /**
   * Add a no-verify flag (--no-verify)
   */
  withNoVerify(): this {
    return this.flag('no-verify');
  }

  /**
   * Add a tags flag (--tags)
   */
  withTags(): this {
    return this.flag('tags');
  }

  /**
   * Add a track flag (--track)
   */
  withTrack(): this {
    return this.flag('track');
  }

  /**
   * Add a no-track flag (--no-track)
   */
  withNoTrack(): this {
    return this.flag('no-track');
  }

  /**
   * Add a set-upstream flag (--set-upstream)
   */
  withSetUpstream(): this {
    return this.flag('set-upstream');
  }

  /**
   * Add an annotated flag (-a)
   */
  withAnnotated(): this {
    return this.flag('a');
  }

  /**
   * Add a sign flag (-s)
   */
  withSign(): this {
    return this.flag('s');
  }

  /**
   * Add an include-untracked flag (--include-untracked)
   */
  withIncludeUntracked(): this {
    return this.flag('include-untracked');
  }

  /**
   * Add a keep-index flag (--keep-index)
   */
  withKeepIndex(): this {
    return this.flag('keep-index');
  }

  /**
   * Add an all flag (--all)
   */
  withAll(): this {
    return this.flag('all');
  }

  /**
   * Add a message option (-m "message")
   */
  withMessage(message: string): this {
    return this.option('m', message);
  }

  /**
   * Build the final command string
   */
  toString(): string {
    const parts = [...this.command];

    // Add options in sorted order for consistency
    Array.from(this.options.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([name, value]) => {
        if (name.length === 1) {
          // Short option (-m "value")
          parts.push(`-${name}`);
          if (typeof value === 'string') {
            parts.push(this.escapeArg(value));
          }
        } else {
          // Long option
          if (value === true) {
            // Flag (--force)
            parts.push(`--${name}`);
          } else if (typeof value === 'string') {
            // Value option (--option=value)
            parts.push(`--${name}=${this.escapeArg(value)}`);
          }
        }
      });

    return parts.join(' ');
  }

  /**
   * Create common Git commands
   */
  static init(): GitCommandBuilder {
    return new GitCommandBuilder('init');
  }

  static clone(): GitCommandBuilder {
    return new GitCommandBuilder('clone');
  }

  static add(): GitCommandBuilder {
    return new GitCommandBuilder('add');
  }

  static commit(): GitCommandBuilder {
    return new GitCommandBuilder('commit');
  }

  static push(): GitCommandBuilder {
    return new GitCommandBuilder('push');
  }

  static pull(): GitCommandBuilder {
    return new GitCommandBuilder('pull');
  }

  static branch(): GitCommandBuilder {
    return new GitCommandBuilder('branch');
  }

  static checkout(): GitCommandBuilder {
    return new GitCommandBuilder('checkout');
  }

  static tag(): GitCommandBuilder {
    return new GitCommandBuilder('tag');
  }

  static remote(): GitCommandBuilder {
    return new GitCommandBuilder('remote');
  }

  static stash(): GitCommandBuilder {
    return new GitCommandBuilder('stash');
  }

  static status(): GitCommandBuilder {
    return new GitCommandBuilder('status');
  }

  static fetch(): GitCommandBuilder {
    return new GitCommandBuilder('fetch');
  }

  /**
   * Escape command arguments that contain spaces or special characters
   */
  private escapeArg(arg: string): string {
    if (arg.includes(' ') || arg.includes('"') || arg.includes('\'')) {
      // Escape quotes and wrap in quotes
      return `"${arg.replace(/"/g, '\\"')}"`;
    }
    return arg;
  }
}
