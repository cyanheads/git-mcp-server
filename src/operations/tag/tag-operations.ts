import { BaseGitOperation } from '../base/base-operation.js';
import { GitCommandBuilder } from '../../common/command-builder.js';
import { CommandResult } from '../base/operation-result.js';
import { ErrorHandler } from '../../errors/error-handler.js';
import { RepositoryValidator } from '../../utils/repository.js';
import { CommandExecutor } from '../../utils/command.js';
import { RepoStateType } from '../../caching/repository-cache.js';
import {
  TagListOptions,
  TagCreateOptions,
  TagDeleteOptions,
  TagListResult,
  TagCreateResult,
  TagDeleteResult,
  TagInfo
} from './tag-types.js';

/**
 * Handles Git tag listing operations
 */
export class TagListOperation extends BaseGitOperation<TagListOptions, TagListResult> {
  protected buildCommand(): GitCommandBuilder {
    const command = GitCommandBuilder.tag();

    // Add format option for parsing
    command.option('format', '%(refname:strip=2)|%(objecttype)|%(subject)|%(taggername)|%(taggeremail)|%(taggerdate)|%(objectname)');

    if (this.options.showMessage) {
      command.flag('n');
    }

    if (this.options.sort) {
      command.option('sort', this.options.sort);
    }

    if (this.options.contains) {
      command.option('contains', this.options.contains);
    }

    if (this.options.pattern) {
      command.arg(this.options.pattern);
    }

    return command;
  }

  protected parseResult(result: CommandResult): TagListResult {
    const tags: TagInfo[] = [];

    // Parse each line of output
    result.stdout.split('\n').filter(Boolean).forEach(line => {
      const [name, type, message, taggerName, taggerEmail, taggerDate, commit] = line.split('|');
      
      const tag: TagInfo = {
        name,
        annotated: type === 'tag',
        commit,
        signed: message?.includes('-----BEGIN PGP SIGNATURE-----') || false
      };

      if (tag.annotated) {
        tag.message = message;
        if (taggerName && taggerEmail && taggerDate) {
          tag.tagger = {
            name: taggerName,
            email: taggerEmail.replace(/[<>]/g, ''),
            date: taggerDate
          };
        }
      }

      tags.push(tag);
    });

    return {
      tags,
      raw: result.stdout
    };
  }

  protected getCacheConfig() {
    return {
      command: 'tag',
      stateType: RepoStateType.TAG
    };
  }

  protected validateOptions(): void {
    // No specific validation needed for listing
  }
}

/**
 * Handles Git tag creation operations
 */
export class TagCreateOperation extends BaseGitOperation<TagCreateOptions, TagCreateResult> {
  protected buildCommand(): GitCommandBuilder {
    const command = GitCommandBuilder.tag();

    if (this.options.message) {
      command.withAnnotated();
      command.withMessage(this.options.message);
    }

    if (this.options.force) {
      command.withForce();
    }

    if (this.options.sign) {
      command.withSign();
    }

    command.arg(this.options.name);

    if (this.options.commit) {
      command.arg(this.options.commit);
    }

    return command;
  }

  protected parseResult(result: CommandResult): TagCreateResult {
    const signed = result.stdout.includes('-----BEGIN PGP SIGNATURE-----');
    
    return {
      name: this.options.name,
      annotated: Boolean(this.options.message),
      signed,
      commit: this.options.commit,
      raw: result.stdout
    };
  }

  protected getCacheConfig() {
    return {
      command: 'tag_create',
      stateType: RepoStateType.TAG
    };
  }

  protected validateOptions(): void {
    if (!this.options.name) {
      throw ErrorHandler.handleValidationError(
        new Error('Tag name is required'),
        { operation: this.context.operation }
      );
    }
  }
}

/**
 * Handles Git tag deletion operations
 */
export class TagDeleteOperation extends BaseGitOperation<TagDeleteOptions, TagDeleteResult> {
  protected async buildCommand(): Promise<GitCommandBuilder> {
    const command = GitCommandBuilder.tag();

    command.flag('d');
    if (this.options.force) {
      command.withForce();
    }

    command.arg(this.options.name);

    if (this.options.remote) {
      // Get remote name from configuration
      const remotes = await RepositoryValidator.getRemotes(
        this.getResolvedPath(),
        this.context.operation
      );

      // Push deletion to all remotes
      for (const remote of remotes) {
        await CommandExecutor.executeGitCommand(
          `push ${remote} :refs/tags/${this.options.name}`,
          this.context.operation,
          this.getResolvedPath()
        );
      }
    }

    return command;
  }

  protected parseResult(result: CommandResult): TagDeleteResult {
    return {
      name: this.options.name,
      forced: this.options.force || false,
      raw: result.stdout
    };
  }

  protected getCacheConfig() {
    return {
      command: 'tag_delete',
      stateType: RepoStateType.TAG
    };
  }

  protected async validateOptions(): Promise<void> {
    if (!this.options.name) {
      throw ErrorHandler.handleValidationError(
        new Error('Tag name is required'),
        { operation: this.context.operation }
      );
    }

    // Ensure tag exists
    await RepositoryValidator.validateTagExists(
      this.getResolvedPath(),
      this.options.name,
      this.context.operation
    );
  }
}
