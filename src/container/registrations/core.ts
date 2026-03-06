/**
 * @fileoverview Registers core application services with the DI container.
 * This module encapsulates the registration of fundamental services such as
 * configuration, logging, storage, and git provider.
 * @module src/container/registrations/core
 */
import { container, Lifecycle } from 'tsyringe';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { parseConfig } from '@/config/index.js';
import {
  AppConfig,
  GitProvider,
  GitProviderFactory as GitProviderFactoryToken,
  Logger,
  RateLimiterService,
  StorageService,
  StorageProvider,
  SupabaseAdminClient,
} from '@/container/tokens.js';
import { GitProviderFactory } from '@/services/git/core/GitProviderFactory.js';
import { StorageService as StorageServiceClass } from '@/storage/core/StorageService.js';
import { createStorageProvider } from '@/storage/core/storageFactory.js';
import type { Database } from '@/storage/providers/supabase/supabase.types.js';
import { JsonRpcErrorCode, McpError } from '@/types-global/errors.js';
import { logger } from '@/utils/index.js';
import { RateLimiter } from '@/utils/security/rateLimiter.js';

/**
 * Registers core application services and values with the tsyringe container.
 */
export const registerCoreServices = () => {
  // Configuration (parsed and registered as a static value)
  const config = parseConfig();
  container.register(AppConfig, { useValue: config });

  // Logger (as a static value)
  container.register(Logger, { useValue: logger });

  type AppConfigType = ReturnType<typeof parseConfig>;

  container.register<SupabaseClient<Database>>(SupabaseAdminClient, {
    useFactory: (c) => {
      const cfg = c.resolve<AppConfigType>(AppConfig);
      if (!cfg.supabase?.url || !cfg.supabase?.serviceRoleKey) {
        throw new McpError(
          JsonRpcErrorCode.ConfigurationError,
          'Supabase URL or service role key is missing for admin client.',
        );
      }
      return createClient<Database>(
        cfg.supabase.url,
        cfg.supabase.serviceRoleKey,
        {
          auth: { persistSession: false, autoRefreshToken: false },
        },
      );
    },
  });

  // --- Refactored Storage Service Registration ---
  // 1. Register the factory for the concrete provider against the provider token.
  // This factory depends on the AppConfig, which is already registered.
  container.register(StorageProvider, {
    useFactory: (c) => createStorageProvider(c.resolve(AppConfig)),
  });

  // 2. Register StorageServiceClass against the service token.
  //    tsyringe will automatically inject the StorageProvider dependency.
  container.register(
    StorageService,
    { useClass: StorageServiceClass },
    { lifecycle: Lifecycle.Singleton },
  );
  // --- End Refactor ---

  // Register RateLimiter as a singleton service
  container.register<RateLimiter>(
    RateLimiterService,
    { useClass: RateLimiter },
    { lifecycle: Lifecycle.Singleton },
  );

  // Git Provider Factory (singleton)
  container.register(GitProviderFactoryToken, {
    useFactory: () => GitProviderFactory.getInstance(),
  });

  // Git Provider (resolved via factory)
  // Note: This is synchronous registration - factory.getProvider() returns a provider instance
  container.register(GitProvider, {
    useFactory: (c) => {
      const factory = c.resolve<GitProviderFactory>(GitProviderFactoryToken);
      // Return factory itself, tools can await getProvider() when needed
      return factory;
    },
  });

  logger.info('Core services registered with the DI container.');
};
