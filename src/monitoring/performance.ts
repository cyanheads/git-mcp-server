import { logger } from '../utils/logger.js';
import { ErrorHandler } from '../errors/error-handler.js';
import { PerformanceError } from './types.js';
import { ErrorCategory, ErrorSeverity } from '../errors/error-types.js';

/**
 * Performance metric types
 */
export enum MetricType {
  OPERATION_DURATION = 'operation_duration',
  MEMORY_USAGE = 'memory_usage',
  COMMAND_EXECUTION = 'command_execution',
  CACHE_HIT = 'cache_hit',
  CACHE_MISS = 'cache_miss',
  RESOURCE_USAGE = 'resource_usage'
}

/**
 * Performance metric data structure
 */
export interface Metric {
  type: MetricType;
  value: number;
  timestamp: number;
  labels: Record<string, string>;
  context?: Record<string, any>;
}

/**
 * Resource usage thresholds
 */
export interface ResourceThresholds {
  memory: {
    warning: number;   // MB
    critical: number;  // MB
  };
  cpu: {
    warning: number;   // Percentage
    critical: number;  // Percentage
  };
  operations: {
    warning: number;   // Operations per second
    critical: number;  // Operations per second
  };
}

/**
 * Default resource thresholds
 */
const DEFAULT_THRESHOLDS: ResourceThresholds = {
  memory: {
    warning: 1024,    // 1GB
    critical: 2048    // 2GB
  },
  cpu: {
    warning: 70,      // 70%
    critical: 90      // 90%
  },
  operations: {
    warning: 100,     // 100 ops/sec
    critical: 200     // 200 ops/sec
  }
};

/**
 * Performance monitoring system
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Metric[] = [];
  private thresholds: ResourceThresholds;
  private operationTimers: Map<string, number> = new Map();
  private readonly METRICS_RETENTION = 3600; // 1 hour in seconds
  private readonly METRICS_CLEANUP_INTERVAL = 300; // 5 minutes in seconds

  private constructor() {
    this.thresholds = DEFAULT_THRESHOLDS;
    this.startMetricsCleanup();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Start operation timing
   */
  startOperation(operation: string): void {
    this.operationTimers.set(operation, performance.now());
  }

  /**
   * End operation timing and record metric
   */
  endOperation(operation: string, context?: Record<string, any>): void {
    const startTime = this.operationTimers.get(operation);
    if (!startTime) {
      logger.warn(operation, 'No start time found for operation timing', undefined, new Error('Missing operation start time'));
      return;
    }

    const duration = performance.now() - startTime;
    this.operationTimers.delete(operation);

    this.recordMetric({
      type: MetricType.OPERATION_DURATION,
      value: duration,
      timestamp: Date.now(),
      labels: { operation },
      context
    });
  }

  /**
   * Record command execution metric
   */
  recordCommandExecution(command: string, duration: number, context?: Record<string, any>): void {
    this.recordMetric({
      type: MetricType.COMMAND_EXECUTION,
      value: duration,
      timestamp: Date.now(),
      labels: { command },
      context
    });
  }

  /**
   * Record memory usage metric
   */
  recordMemoryUsage(context?: Record<string, any>): void {
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024; // Convert to MB
    
    // Record heap usage
    this.recordMetric({
      type: MetricType.MEMORY_USAGE,
      value: memoryUsageMB,
      timestamp: Date.now(),
      labels: { type: 'heap' },
      context: {
        ...context,
        heapTotal: memoryUsage.heapTotal / 1024 / 1024,
        external: memoryUsage.external / 1024 / 1024,
        rss: memoryUsage.rss / 1024 / 1024
      }
    });

    // Check thresholds
    this.checkMemoryThresholds(memoryUsageMB);
  }

  /**
   * Record resource usage metric
   */
  recordResourceUsage(
    resource: string,
    value: number,
    context?: Record<string, any>
  ): void {
    this.recordMetric({
      type: MetricType.RESOURCE_USAGE,
      value,
      timestamp: Date.now(),
      labels: { resource },
      context
    });
  }

  /**
   * Record cache hit/miss
   */
  recordCacheAccess(hit: boolean, cacheType: string, context?: Record<string, any>): void {
    this.recordMetric({
      type: hit ? MetricType.CACHE_HIT : MetricType.CACHE_MISS,
      value: 1,
      timestamp: Date.now(),
      labels: { cacheType },
      context
    });
  }

  /**
   * Get metrics for a specific type and time range
   */
  getMetrics(
    type: MetricType,
    startTime: number,
    endTime: number = Date.now()
  ): Metric[] {
    return this.metrics.filter(metric => 
      metric.type === type &&
      metric.timestamp >= startTime &&
      metric.timestamp <= endTime
    );
  }

  /**
   * Calculate operation rate (operations per second)
   */
  getOperationRate(operation: string, windowSeconds: number = 60): number {
    const now = Date.now();
    const startTime = now - (windowSeconds * 1000);
    
    const operationMetrics = this.getMetrics(
      MetricType.OPERATION_DURATION,
      startTime,
      now
    ).filter(metric => metric.labels.operation === operation);

    return operationMetrics.length / windowSeconds;
  }

  /**
   * Get average operation duration
   */
  getAverageOperationDuration(
    operation: string,
    windowSeconds: number = 60
  ): number {
    const now = Date.now();
    const startTime = now - (windowSeconds * 1000);
    
    const operationMetrics = this.getMetrics(
      MetricType.OPERATION_DURATION,
      startTime,
      now
    ).filter(metric => metric.labels.operation === operation);

    if (operationMetrics.length === 0) return 0;

    const totalDuration = operationMetrics.reduce(
      (sum, metric) => sum + metric.value,
      0
    );
    return totalDuration / operationMetrics.length;
  }

  /**
   * Get cache hit rate
   */
  getCacheHitRate(cacheType: string, windowSeconds: number = 60): number {
    const now = Date.now();
    const startTime = now - (windowSeconds * 1000);
    
    const hits = this.getMetrics(MetricType.CACHE_HIT, startTime, now)
      .filter(metric => metric.labels.cacheType === cacheType).length;
    
    const misses = this.getMetrics(MetricType.CACHE_MISS, startTime, now)
      .filter(metric => metric.labels.cacheType === cacheType).length;

    const total = hits + misses;
    return total === 0 ? 0 : hits / total;
  }

  /**
   * Update resource thresholds
   */
  updateThresholds(thresholds: Partial<ResourceThresholds>): void {
    this.thresholds = {
      ...this.thresholds,
      ...thresholds
    };
  }

  /**
   * Get current thresholds
   */
  getThresholds(): ResourceThresholds {
    return { ...this.thresholds };
  }

  /**
   * Private helper to record a metric
   */
  private recordMetric(metric: Metric): void {
    this.metrics.push(metric);

    // Log high severity metrics
    if (
      metric.type === MetricType.MEMORY_USAGE ||
      metric.type === MetricType.RESOURCE_USAGE
    ) {
      const metricError = new PerformanceError(
        `Recorded ${metric.type} metric`,
        {
          details: {
            value: metric.value,
            labels: metric.labels,
            context: metric.context
          },
          operation: metric.labels.operation || 'performance'
        }
      );
      logger.info(
        metric.labels.operation || 'performance',
        `Recorded ${metric.type} metric`,
        undefined,
        metricError
      );
    }
  }

  /**
   * Check memory usage against thresholds
   */
  private checkMemoryThresholds(memoryUsageMB: number): void {
    if (memoryUsageMB >= this.thresholds.memory.critical) {
      const error = new PerformanceError(
        `Critical memory usage: ${memoryUsageMB.toFixed(2)}MB`,
        {
          details: {
            currentUsage: memoryUsageMB,
            threshold: this.thresholds.memory.critical
          },
          operation: 'memory_monitor',
          severity: ErrorSeverity.CRITICAL,
          category: ErrorCategory.SYSTEM
        }
      );
      ErrorHandler.handleSystemError(error, {
        operation: 'memory_monitor',
        severity: ErrorSeverity.CRITICAL,
        category: ErrorCategory.SYSTEM
      });
    } else if (memoryUsageMB >= this.thresholds.memory.warning) {
      const warningError = new PerformanceError(
        `High memory usage: ${memoryUsageMB.toFixed(2)}MB`,
        {
          details: {
            currentUsage: memoryUsageMB,
            threshold: this.thresholds.memory.warning
          },
          operation: 'memory_monitor'
        }
      );
      logger.warn(
        'memory_monitor',
        `High memory usage: ${memoryUsageMB.toFixed(2)}MB`,
        undefined,
        warningError
      );
    }
  }

  /**
   * Start periodic metrics cleanup
   */
  private startMetricsCleanup(): void {
    setInterval(() => {
      const cutoffTime = Date.now() - (this.METRICS_RETENTION * 1000);
      this.metrics = this.metrics.filter(metric => metric.timestamp >= cutoffTime);
    }, this.METRICS_CLEANUP_INTERVAL * 1000);
  }

  /**
   * Get current performance statistics
   */
  getStatistics(): Record<string, any> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const fiveMinutesAgo = now - 300000;

    return {
      memory: {
        current: process.memoryUsage().heapUsed / 1024 / 1024,
        trend: this.getMetrics(MetricType.MEMORY_USAGE, fiveMinutesAgo)
          .map(m => ({ timestamp: m.timestamp, value: m.value }))
      },
      operations: {
        last1m: this.metrics
          .filter(m => 
            m.type === MetricType.OPERATION_DURATION &&
            m.timestamp >= oneMinuteAgo
          ).length,
        last5m: this.metrics
          .filter(m => 
            m.type === MetricType.OPERATION_DURATION &&
            m.timestamp >= fiveMinutesAgo
          ).length
      },
      cache: {
        hitRate1m: this.getCacheHitRate('all', 60),
        hitRate5m: this.getCacheHitRate('all', 300)
      },
      commandExecutions: {
        last1m: this.metrics
          .filter(m => 
            m.type === MetricType.COMMAND_EXECUTION &&
            m.timestamp >= oneMinuteAgo
          ).length,
        last5m: this.metrics
          .filter(m => 
            m.type === MetricType.COMMAND_EXECUTION &&
            m.timestamp >= fiveMinutesAgo
          ).length
      }
    };
  }
}
