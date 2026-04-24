/**
 * @fileoverview CLI provider git tag operation
 * @module services/git/providers/cli/operations/tags/tag
 */

import { JsonRpcErrorCode, McpError } from '@/types-global/errors.js';
import { logger, type RequestContext } from '@/utils/index.js';

import type {
  GitOperationContext,
  GitTagInfo,
  GitTagOptions,
  GitTagResult,
} from '../../../../types.js';
import {
  buildGitCommand,
  GIT_FIELD_DELIMITER,
  GIT_RECORD_DELIMITER,
  mapGitError,
  shouldSignCommits,
} from '../../utils/index.js';

/**
 * Execute git tag operations.
 *
 * @param options - Tag options
 * @param context - Operation context
 * @param execGit - Function to execute git commands
 * @returns Tag result
 */
export async function executeTag(
  options: GitTagOptions,
  context: GitOperationContext,
  execGit: (
    args: string[],
    cwd: string,
    ctx: RequestContext,
    options?: { allowNonZeroExit?: boolean },
  ) => Promise<{ stdout: string; stderr: string; exitCode?: number }>,
): Promise<GitTagResult> {
  try {
    const args: string[] = [];

    switch (options.mode) {
      case 'list': {
        // Use for-each-ref with ASCII control chars as delimiters so multi-line
        // annotation bodies round-trip cleanly (body always last, RS terminates record).
        const format =
          [
            '%(refname:short)', // Tag name
            '%(if)%(*objectname:short)%(then)%(*objectname:short)%(else)%(objectname:short)%(end)', // Dereferenced commit hash
            '%(if)%(contents:subject)%(then)%(contents:subject)%(end)', // Annotation subject
            '%(if)%(taggername)%(then)%(taggername) %(taggeremail)%(end)', // Tagger
            '%(if)%(creatordate:unix)%(then)%(creatordate:unix)%(end)', // Timestamp
            '%(if)%(contents:body)%(then)%(contents:body)%(end)', // Annotation body (may contain newlines)
          ].join(GIT_FIELD_DELIMITER) + GIT_RECORD_DELIMITER;

        // Multiple --sort flags: the LAST one is the primary key. Listing
        // -version:refname first makes version-aware refname the tiebreaker
        // when creatordate ties (e.g., tags created in the same second), so
        // v0.10.0 outranks v0.7.0 instead of falling below it lexically.
        const forEachRefArgs = [
          `--format=${format}`,
          '--sort=-version:refname',
          '--sort=-creatordate',
        ];
        if (typeof options.limit === 'number' && options.limit > 0) {
          forEachRefArgs.push(`--count=${options.limit}`);
        }
        forEachRefArgs.push('refs/tags');

        const refCmd = buildGitCommand({
          command: 'for-each-ref',
          args: forEachRefArgs,
        });
        const result = await execGit(
          refCmd,
          context.workingDirectory,
          context.requestContext,
        );

        const tags: GitTagInfo[] = [];

        for (const record of result.stdout
          .split(GIT_RECORD_DELIMITER)
          .map((r) => r.replace(/^\n/, ''))
          .filter((r) => r.length > 0)) {
          const [name, commit, message, tagger, timestamp, annotationBody] =
            record.split(GIT_FIELD_DELIMITER);
          if (!name) continue;

          const tag: GitTagInfo = {
            name,
            commit: commit || '',
          };
          if (message) tag.message = message;
          if (tagger) tag.tagger = tagger;
          if (timestamp) tag.timestamp = parseInt(timestamp, 10);
          if (annotationBody) tag.annotationBody = annotationBody.trimEnd();

          tags.push(tag);
        }

        return { mode: 'list' as const, tags };
      }

      case 'create': {
        if (!options.tagName) {
          throw new Error('Tag name is required for create operation');
        }

        // Signing policy: attempt when GIT_SIGN_COMMITS is enabled, fall
        // back to unsigned silently on failure. `signed` in the result
        // reflects the actual outcome so callers can observe fallback.
        const signRequested = shouldSignCommits();
        let signed = false;
        let signingWarning: string | undefined;

        const buildCreateArgs = (sign: boolean): string[] => {
          const createArgs: string[] = [options.tagName!];

          if (sign) {
            const message = options.message || `Tag ${options.tagName}`;
            createArgs.push('-s', '-m', message);
          } else if (options.message) {
            createArgs.push('-a', '-m', options.message);
          } else if (options.annotated) {
            // Annotated without message — git would open an editor,
            // which doesn't work in MCP context. Use tag name as default message.
            createArgs.push('-a', '-m', `Tag ${options.tagName}`);
          }

          if (options.commit) {
            createArgs.push(options.commit);
          }

          if (options.force) {
            createArgs.push('--force');
          }

          return createArgs;
        };

        // When not signing, override git config that might force signing/annotation
        // (e.g., tag.gpgSign=true) which would open an editor in non-interactive MCP context
        const buildCmd = (sign: boolean): string[] => {
          const configOverride = sign ? [] : ['-c', 'tag.gpgSign=false'];
          return [
            ...configOverride,
            ...buildGitCommand({
              command: 'tag',
              args: buildCreateArgs(sign),
            }),
          ];
        };

        try {
          await execGit(
            buildCmd(signRequested),
            context.workingDirectory,
            context.requestContext,
          );
          signed = signRequested;
        } catch (error) {
          if (!signRequested) {
            throw error;
          }
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.warning(
            'Tag signing failed; retrying unsigned. Set GIT_SIGN_COMMITS=false to suppress this attempt.',
            { ...context.requestContext, error },
          );
          signingWarning = `GIT_SIGN_COMMITS is enabled but signing failed; tag created unsigned. Check signing key availability (gpg-agent running, SSH key accessible). Underlying error: ${errorMessage}`;
          await execGit(
            buildCmd(false),
            context.workingDirectory,
            context.requestContext,
          );
        }

        const createResult: GitTagResult = {
          mode: 'create' as const,
          created: options.tagName,
          signed,
        };

        if (signingWarning) {
          createResult.signingWarning = signingWarning;
        }

        return createResult;
      }

      case 'delete': {
        if (!options.tagName) {
          throw new Error('Tag name is required for delete operation');
        }

        args.push('-d', options.tagName);

        const cmd = buildGitCommand({ command: 'tag', args });
        await execGit(cmd, context.workingDirectory, context.requestContext);

        const deleteResult = {
          mode: 'delete' as const,
          deleted: options.tagName,
        };

        return deleteResult;
      }

      case 'verify': {
        if (!options.tagName) {
          throw new Error('Tag name is required for verify operation');
        }

        /**
         * `git tag -v` writes tag metadata to stdout and signature
         * verification output to stderr, returning non-zero on any
         * verification failure. We pass `allowNonZeroExit` so we can
         * distinguish "unsigned / missing trust / bad sig" (all valid
         * structured outcomes) from "tag doesn't exist" (a real error).
         */
        const cmd = buildGitCommand({
          command: 'tag',
          args: ['-v', options.tagName],
        });
        const result = await execGit(
          cmd,
          context.workingDirectory,
          context.requestContext,
          { allowNonZeroExit: true },
        );

        return parseVerifyOutput(
          options.tagName,
          result.stderr,
          result.exitCode ?? 0,
        );
      }

      default:
        throw new Error('Unknown tag operation mode');
    }
  } catch (error) {
    throw mapGitError(error, 'tag');
  }
}

/**
 * Parse `git tag -v` stderr into a structured verify result.
 *
 * Distinguishes five outcomes so callers can act on them without
 * re-parsing raw output:
 * 1. tag not found → throws (a real caller error, not a verify outcome)
 * 2. unsigned → verified=false, warning explains no signature
 * 3. missing SSH trust config → verified=false, warning points at
 *    `gpg.ssh.allowedSignersFile` (signature may be valid; env can't tell)
 * 4. bad signature → verified=false, warning names the failure
 * 5. good signature → verified=true, populates type/identity/key
 */
function parseVerifyOutput(
  tagName: string,
  stderr: string,
  exitCode: number,
): GitTagResult {
  if (/^error: tag '.+' not found/m.test(stderr)) {
    throw new McpError(
      JsonRpcErrorCode.InvalidRequest,
      `Tag not found: ${tagName}`,
      { tagName },
    );
  }

  const base: GitTagResult = {
    mode: 'verify',
    verifiedTag: tagName,
    rawOutput: stderr,
  };

  if (/^error: no signature found$/m.test(stderr)) {
    return {
      ...base,
      verified: false,
      warning:
        'Tag has no signature. Create with a signing key and `GIT_SIGN_COMMITS=true` to produce a signed tag.',
    };
  }

  if (
    /gpg\.ssh\.allowedSignersFile needs to be configured/.test(stderr) ||
    /No principal matched/.test(stderr)
  ) {
    return {
      ...base,
      verified: false,
      signatureType: 'ssh',
      warning:
        'SSH signature verification requires `gpg.ssh.allowedSignersFile` to be configured. The tag may be validly signed; this environment cannot verify it.',
    };
  }

  const gpgBadMatch = /(?:gpg|gpgsm): BAD signature from "([^"]+)"/.exec(
    stderr,
  );
  if (gpgBadMatch) {
    return {
      ...base,
      verified: false,
      signatureType: stderr.includes('gpgsm:') ? 'x509' : 'gpg',
      signerIdentity: gpgBadMatch[1]!,
      warning: 'Signature does not validate (BAD signature).',
    };
  }

  const sshBadMatch =
    /Signature verification failed.*? for "([^"]+)"|Could not verify signature/i.exec(
      stderr,
    );
  if (sshBadMatch && exitCode !== 0) {
    const result: GitTagResult = {
      ...base,
      verified: false,
      signatureType: 'ssh',
      warning: 'SSH signature does not validate.',
    };
    if (sshBadMatch[1]) result.signerIdentity = sshBadMatch[1];
    return result;
  }

  const gpgGoodMatch = /gpg: Good signature from "([^"]+)"/.exec(stderr);
  if (gpgGoodMatch) {
    const result: GitTagResult = {
      ...base,
      verified: true,
      signatureType: 'gpg',
      signerIdentity: gpgGoodMatch[1]!,
    };
    const keyMatch = /using \S+ key ([0-9A-Fa-f]{8,})/.exec(stderr);
    if (keyMatch) result.signerKey = keyMatch[1]!;
    return result;
  }

  const x509GoodMatch = /gpgsm: Good signature from "([^"]+)"/.exec(stderr);
  if (x509GoodMatch) {
    return {
      ...base,
      verified: true,
      signatureType: 'x509',
      signerIdentity: x509GoodMatch[1]!,
    };
  }

  const sshGoodMatch =
    /Good "git" signature for (.+?) with \S+ key (SHA256:\S+)/.exec(stderr);
  if (sshGoodMatch) {
    return {
      ...base,
      verified: true,
      signatureType: 'ssh',
      signerIdentity: sshGoodMatch[1]!.trim(),
      signerKey: sshGoodMatch[2]!,
    };
  }

  // Exit 0 with no recognized pattern → trust git's exit code. This
  // catches future output variants that still succeed.
  if (exitCode === 0) {
    return { ...base, verified: true };
  }

  return {
    ...base,
    verified: false,
    warning:
      'Verification failed but the output format was not recognized. See `rawOutput` for details.',
  };
}
