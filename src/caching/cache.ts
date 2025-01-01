import { logger } from '../utils/logger.js';
import { PerformanceMonitor } from '../monitoring/performance.js';

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  hits: number;
  lastAccess: number;
}

/**
 * Cache configuration
 */
interface CacheConfig {
  defaultTTL: number;        // Default time-to-live in milliseconds
  maxSize: number;          // Maximum number of entries
  cleanupInterval: number;  // Cleanup interval in milliseconds
}

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: CacheConfig = {
  defaultTTL: 5 * 60 * 1000,  // 5 minutes
  maxSize: 1000,              // 1000 entries
  cleanupInterval: 60 * 1000  // 1 minute
};

/**
 * Generic cache implementation with performance monitoring
 */
export class Cache<T> {
  private entries: Map<string, CacheEntry<T>> = new Map();
  private config: CacheConfig;
  private performanceMonitor: PerformanceMonitor;
  private readonly cacheType: string;

  constructor(cacheType: string, config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cacheType = cacheType;
    this.performanceMonitor = PerformanceMonitor.getInstance();
    this.startCleanup();
  }

  /**
   * Set a cache entry
   */
  set(key: string, value: T, ttl: number = this.config.defaultTTL): void {
    // Check cache size limit
    if (this.entries.size >= this.config.maxSize) {
      this.evictOldest();
    }

    this.entries.set(key, {
      value,
      timestamp: Date.now(),
      ttl,
      hits: 0,
      lastAccess: Date.now()
    });

    logger.debug(
      'cache',
      `Set cache entry: ${key}`,
      undefined,
      { cacheType: this.cacheType }
    );
  }

  /**
   * Get a cache entry
   */
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    
    if (!entry) {
      this.performanceMonitor.recordCacheAccess(false, this.cacheType);
      return undefined;
    }

    // Check if entry is expired
    if (this.isExpired(entry)) {
      this.entries.delete(key);
      this.performanceMonitor.recordCacheAccess(false, this.cacheType);
      return undefined;
    }

    // Update entry metadata
    entry.hits++;
    entry.lastAccess = Date.now();
    this.performanceMonitor.recordCacheAccess(true, this.cacheType);

    logger.debug(
      'cache',
      `Cache hit: ${key}`,
      undefined,
      { cacheType: this.cacheType, hits: entry.hits }
    );

    return entry.value;
  }

  /**
   * Delete a cache entry
   */
  delete(key: string): void {
    this.entries.delete(key);
    logger.debug(
      'cache',
      `Deleted cache entry: ${key}`,
      undefined,
      { cacheType: this.cacheType }
    );
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.entries.clear();
    logger.info(
      'cache',
      'Cleared cache',
      undefined,
      { cacheType: this.cacheType }
    );
  }

  /**
   * Get cache statistics
   */
  getStats(): Record<string, any> {
    const now = Date.now();
    let totalHits = 0;
    let totalSize = 0;
    let oldestTimestamp = now;
    let newestTimestamp = 0;

    this.entries.forEach(entry => {
      totalHits += entry.hits;
      totalSize++;
      oldestTimestamp = Math.min(oldestTimestamp, entry.timestamp);
      newestTimestamp = Math.max(newestTimestamp, entry.timestamp);
    });

    return {
      size: totalSize,
      maxSize: this.config.maxSize,
      totalHits,
      oldestEntry: oldestTimestamp === now ? null : oldestTimestamp,
      newestEntry: newestTimestamp === 0 ? null : newestTimestamp,
      hitRate: this.performanceMonitor.getCacheHitRate(this.cacheType)
    };
  }

  /**
   * Check if a cache entry exists and is valid
   */
  has(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Update cache configuration
   */
  updateConfig(config: Partial<CacheConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
    logger.info(
      'cache',
      'Updated cache configuration',
      undefined,
      { cacheType: this.cacheType, config: this.config }
    );
  }

  /**
   * Get current configuration
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }

  /**
   * Check if a cache entry is expired
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Evict the least recently used entry
   */
  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestAccess = Date.now();

    this.entries.forEach((entry, key) => {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    });

    if (oldestKey) {
      this.entries.delete(oldestKey);
      logger.debug(
        'cache',
        `Evicted oldest entry: ${oldestKey}`,
        undefined,
        { cacheType: this.cacheType }
      );
    }
  }

  /**
   * Start periodic cache cleanup
   */
  private startCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      let expiredCount = 0;

      this.entries.forEach((entry, key) => {
        if (now - entry.timestamp > entry.ttl) {
          this.entries.delete(key);
          expiredCount++;
        }
      });

      if (expiredCount > 0) {
        logger.debug(
          'cache',
          `Cleaned up ${expiredCount} expired entries`,
          undefined,
          { cacheType: this.cacheType }
        );
      }
    }, this.config.cleanupInterval);
  }
}

/**
 * Repository state cache
 */
export class RepositoryStateCache extends Cache<any> {
  constructor() {
    super('repository_state', {
      defaultTTL: 30 * 1000,  // 30 seconds
      maxSize: 100            // 100 entries
    });
  }
}

/**
 * Command result cache
 */
export class CommandResultCache extends Cache<any> {
  constructor() {
    super('command_result', {
      defaultTTL: 5 * 60 * 1000,  // 5 minutes
      maxSize: 500                // 500 entries
    });
  }

  /**
   * Generate cache key for a command
   */
  static generateKey(command: string, workingDir?: string): string {
    return `${workingDir || ''}:${command}`;
  }
}
