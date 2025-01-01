import { RepositoryStateCache, CommandResultCache } from './cache.js';
import { logger } from '../utils/logger.js';
import { PerformanceMonitor } from '../monitoring/performance.js';

/**
 * Repository state types
 */
export enum RepoStateType {
  BRANCH = 'branch',
  STATUS = 'status',
  REMOTE = 'remote',
  TAG = 'tag',
  STASH = 'stash'
}

/**
 * Repository state manager with caching
 */
export class RepositoryCacheManager {
  private static instance: RepositoryCacheManager;
  private stateCache: RepositoryStateCache;
  private commandCache: CommandResultCache;
  private performanceMonitor: PerformanceMonitor;

  private constructor() {
    this.stateCache = new RepositoryStateCache();
    this.commandCache = new CommandResultCache();
    this.performanceMonitor = PerformanceMonitor.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): RepositoryCacheManager {
    if (!RepositoryCacheManager.instance) {
      RepositoryCacheManager.instance = new RepositoryCacheManager();
    }
    return RepositoryCacheManager.instance;
  }

  /**
   * Get repository state from cache or execute command
   */
  async getState(
    repoPath: string,
    stateType: RepoStateType,
    command: string,
    executor: () => Promise<any>
  ): Promise<any> {
    const cacheKey = this.getStateKey(repoPath, stateType);
    const cachedState = this.stateCache.get(cacheKey);

    if (cachedState !== undefined) {
      logger.debug(
        'cache',
        `Cache hit for repository state: ${stateType}`,
        repoPath,
        { command }
      );
      return cachedState;
    }

    // Start timing the operation
    const startTime = performance.now();

    try {
      const result = await executor();
      const duration = performance.now() - startTime;

      // Record performance metrics
      this.performanceMonitor.recordCommandExecution(command, duration, {
        repoPath,
        stateType,
        cached: false
      });

      // Cache the result
      this.stateCache.set(cacheKey, result);

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.performanceMonitor.recordCommandExecution(command, duration, {
        repoPath,
        stateType,
        cached: false,
        error: true
      });
      throw error;
    }
  }

  /**
   * Get command result from cache or execute command
   */
  async getCommandResult(
    repoPath: string,
    command: string,
    executor: () => Promise<any>
  ): Promise<any> {
    const cacheKey = CommandResultCache.generateKey(command, repoPath);
    const cachedResult = this.commandCache.get(cacheKey);

    if (cachedResult !== undefined) {
      logger.debug(
        'cache',
        `Cache hit for command result`,
        repoPath,
        { command }
      );
      return cachedResult;
    }

    // Start timing the operation
    const startTime = performance.now();

    try {
      const result = await executor();
      const duration = performance.now() - startTime;

      // Record performance metrics
      this.performanceMonitor.recordCommandExecution(command, duration, {
        repoPath,
        cached: false
      });

      // Cache the result
      this.commandCache.set(cacheKey, result);

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.performanceMonitor.recordCommandExecution(command, duration, {
        repoPath,
        cached: false,
        error: true
      });
      throw error;
    }
  }

  /**
   * Invalidate repository state cache
   */
  invalidateState(repoPath: string, stateType?: RepoStateType): void {
    if (stateType) {
      const cacheKey = this.getStateKey(repoPath, stateType);
      this.stateCache.delete(cacheKey);
      logger.debug(
        'cache',
        `Invalidated repository state cache`,
        repoPath,
        { stateType }
      );
    } else {
      // Invalidate all state types for this repository
      Object.values(RepoStateType).forEach(type => {
        const cacheKey = this.getStateKey(repoPath, type);
        this.stateCache.delete(cacheKey);
      });
      logger.debug(
        'cache',
        `Invalidated all repository state cache`,
        repoPath
      );
    }
  }

  /**
   * Invalidate command result cache
   */
  invalidateCommand(repoPath: string, command?: string): void {
    if (command) {
      const cacheKey = CommandResultCache.generateKey(command, repoPath);
      this.commandCache.delete(cacheKey);
      logger.debug(
        'cache',
        `Invalidated command result cache`,
        repoPath,
        { command }
      );
    } else {
      // Clear all command results for this repository
      // Note: This is a bit inefficient as it clears all commands for all repos
      // A better solution would be to store repo-specific commands separately
      this.commandCache.clear();
      logger.debug(
        'cache',
        `Invalidated all command result cache`,
        repoPath
      );
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): Record<string, any> {
    return {
      state: this.stateCache.getStats(),
      command: this.commandCache.getStats()
    };
  }

  /**
   * Generate cache key for repository state
   */
  private getStateKey(repoPath: string, stateType: RepoStateType): string {
    return `${repoPath}:${stateType}`;
  }
}

// Export singleton instance
export const repositoryCache = RepositoryCacheManager.getInstance();
