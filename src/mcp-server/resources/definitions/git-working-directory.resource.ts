/**
 * @fileoverview Git working directory resource - exposes session working directory
 * @module mcp-server/resources/definitions/git-working-directory
 */
import { z } from 'zod';

import { type RequestContext, logger } from '@/utils/index.js';
import { withResourceAuth } from '@/mcp-server/transports/auth/lib/withAuth.js';
import { type ResourceDefinition } from '@/mcp-server/resources/utils/resourceDefinition.js';
import type { StorageService } from '@/storage/core/StorageService.js';

const ParamsSchema = z
  .object({})
  .describe('No parameters required for working directory resource.');

const OutputSchema = z
  .object({
    workingDirectory: z
      .string()
      .nullable()
      .describe(
        'The current session working directory path, or null if not set.',
      ),
    isSet: z
      .boolean()
      .describe('Whether a working directory is currently configured.'),
    message: z
      .string()
      .describe('Human-readable status message about the working directory.'),
  })
  .describe('Git working directory resource response.');

type WorkingDirParams = z.infer<typeof ParamsSchema>;
type WorkingDirOutput = z.infer<typeof OutputSchema>;

async function gitWorkingDirectoryLogic(
  uri: URL,
  _params: WorkingDirParams,
  context: RequestContext,
): Promise<WorkingDirOutput> {
  logger.debug('Processing git working directory resource', {
    ...context,
    resourceUri: uri.href,
  });

  // Resolve dependencies via DI
  const { container } = await import('tsyringe');
  const { StorageService: StorageServiceToken } =
    await import('@/container/tokens.js');

  const storage = container.resolve<StorageService>(StorageServiceToken);

  // Graceful degradation for tenantId
  const tenantId = context.tenantId || 'default-tenant';

  // Attempt to get working directory from session storage
  const storageKey = `session:workingDir:${tenantId}`;
  const workingDirectory = await storage.get<string>(storageKey, context);

  const isSet = !!workingDirectory;
  const message = isSet
    ? `Working directory is set to: ${workingDirectory}`
    : 'No working directory is currently set. Use git_set_working_dir to set one.';

  logger.debug('Git working directory resource processed', {
    ...context,
    workingDirectory,
    isSet,
  });

  return {
    workingDirectory: workingDirectory || null,
    isSet,
    message,
  };
}

export const gitWorkingDirectoryResource: ResourceDefinition<
  typeof ParamsSchema,
  typeof OutputSchema
> = {
  name: 'git-working-directory',
  title: 'Git Working Directory',
  description:
    'Provides the current session working directory for git operations. This is the directory set via git_set_working_dir and used as the default for all git commands.',
  uriTemplate: 'git://working-directory',
  paramsSchema: ParamsSchema,
  outputSchema: OutputSchema,
  mimeType: 'application/json',
  examples: [
    {
      name: 'Get working directory',
      uri: 'git://working-directory',
    },
  ],
  annotations: { readOnlyHint: true },
  list: () => ({
    resources: [
      {
        uri: 'git://working-directory',
        name: 'Git Working Directory',
        mimeType: 'application/json',
      },
    ],
  }),
  logic: withResourceAuth(['resource:git:read'], gitWorkingDirectoryLogic),
};
