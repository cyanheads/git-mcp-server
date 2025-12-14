import { describe, expect, it } from 'vitest';

import {
  JsonRpcErrorCode,
  McpError,
} from '../../../src/types-global/errors.js';
import { sanitization } from '../../../src/utils/security/sanitization.js';

describe('Sanitization Utility', () => {
  describe('sanitizeHtml', () => {
    it('should remove <script> tags and other malicious HTML', () => {
      const maliciousInput =
        '<script>alert("xss")</script><p>Hello</p><iframe src="http://example.com"></iframe>';
      const expectedOutput = '<p>Hello</p>';
      expect(sanitization.sanitizeHtml(maliciousInput)).toBe(expectedOutput);
    });

    it('should allow safe HTML tags like <p> and <b>', () => {
      const safeInput = '<p>This is a <b>bold</b> statement.</p>';
      expect(sanitization.sanitizeHtml(safeInput)).toBe(safeInput);
    });

    it('should return an empty string for null or undefined input', () => {
      expect(sanitization.sanitizeHtml(null as unknown as string)).toBe('');
      expect(sanitization.sanitizeHtml(undefined as unknown as string)).toBe(
        '',
      );
    });
  });

  describe('sanitizeString', () => {
    it('should handle "text" context by stripping all HTML', () => {
      const input = '<p>Hello World</p>';
      const expected = 'Hello World';
      expect(sanitization.sanitizeString(input, { context: 'text' })).toBe(
        expected,
      );
    });

    it('should handle "html" context correctly', () => {
      const maliciousInput = '<script>alert("xss")</script><p>Hello</p>';
      const expected = '<p>Hello</p>';
      expect(
        sanitization.sanitizeString(maliciousInput, { context: 'html' }),
      ).toBe(expected);
    });

    it('supports explicit tag and attribute whitelists for HTML sanitization', () => {
      const input =
        '<a href="https://example.com" onclick="alert(1)">Read more</a>';
      const sanitized = sanitization.sanitizeString(input, {
        context: 'html',
        allowedTags: ['a'],
        allowedAttributes: {
          a: ['href'],
        },
      });

      expect(sanitized).toBe('<a href="https://example.com">Read more</a>');
    });

    it('should handle "url" context and return empty for invalid URLs', () => {
      const validInput = 'https://example.com/path';
      const invalidUrl = 'javascript:alert("xss")';
      expect(sanitization.sanitizeString(validInput, { context: 'url' })).toBe(
        validInput,
      );
      expect(sanitization.sanitizeString(invalidUrl, { context: 'url' })).toBe(
        '',
      );
    });

    it('should throw an McpError when context is "javascript"', () => {
      const jsInput = 'alert("hello")';
      expect(() =>
        sanitization.sanitizeString(jsInput, { context: 'javascript' }),
      ).toThrow(McpError);
      expect(() =>
        sanitization.sanitizeString(jsInput, { context: 'javascript' }),
      ).toThrow(
        expect.objectContaining({ code: JsonRpcErrorCode.ValidationError }),
      );
    });
  });

  describe('sanitizePath', () => {
    it('should prevent path traversal with ../ by normalizing', () => {
      const traversalPath = 'a/b/../c';
      const result = sanitization.sanitizePath(traversalPath);
      expect(result.sanitizedPath).toBe('a/c');
    });

    it('should throw an error for paths containing null bytes (\\0)', () => {
      const nullBytePath = '/path/to/file\0.txt';
      expect(() => sanitization.sanitizePath(nullBytePath)).toThrow(McpError);
      expect(() => sanitization.sanitizePath(nullBytePath)).toThrow(
        expect.objectContaining({
          code: JsonRpcErrorCode.ValidationError,
          message: 'Path contains null byte, which is disallowed.',
        }),
      );
    });

    it('should respect the rootDir option and throw if path escapes it', () => {
      const rootDir = '/app/safe-zone';
      const validPath = 'data/file.txt';
      // This path attempts to go up one level from the root.
      const invalidPath = '../outside.txt';

      // The sanitized path should be relative to the rootDir.
      expect(
        sanitization.sanitizePath(validPath, { rootDir }).sanitizedPath,
      ).toBe('data/file.txt');

      // This should throw because it tries to leave the root directory.
      expect(() => sanitization.sanitizePath(invalidPath, { rootDir })).toThrow(
        McpError,
      );
    });

    it('should handle absolute paths correctly based on the allowAbsolute option', () => {
      const absolutePath = '/etc/passwd';
      // By default, absolute paths are not allowed and should throw.
      expect(() =>
        sanitization.sanitizePath(absolutePath, { allowAbsolute: false }),
      ).toThrow(McpError);
      // When allowed, the path should be returned as is.
      expect(
        sanitization.sanitizePath(absolutePath, { allowAbsolute: true })
          .sanitizedPath,
      ).toBe(absolutePath);
    });

    it('should handle absolute path within rootDir correctly', () => {
      const rootDir = '/app/projects';
      const absolutePath = '/app/projects/my-repo';

      // Absolute path within rootDir should resolve to relative path
      const result = sanitization.sanitizePath(absolutePath, {
        rootDir,
        allowAbsolute: true,
      });
      expect(result.sanitizedPath).toBe('my-repo');
    });

    it('should reject absolute path outside rootDir', () => {
      const rootDir = '/app/projects';
      const absolutePath = '/etc/passwd';

      // Absolute path outside rootDir should throw
      expect(() =>
        sanitization.sanitizePath(absolutePath, {
          rootDir,
          allowAbsolute: true,
        }),
      ).toThrow(McpError);
      expect(() =>
        sanitization.sanitizePath(absolutePath, {
          rootDir,
          allowAbsolute: true,
        }),
      ).toThrow(
        expect.objectContaining({
          message: expect.stringContaining('Path traversal detected'),
        }),
      );
    });

    it('should handle rootDir as the exact path', () => {
      const rootDir = '/app/projects';

      // Using rootDir as the path should return '.'
      const result = sanitization.sanitizePath(rootDir, {
        rootDir,
        allowAbsolute: true,
      });
      expect(result.sanitizedPath).toBe('.');
    });

    it('should handle nested absolute paths within rootDir', () => {
      const rootDir = '/app/projects';
      const absolutePath = '/app/projects/deep/nested/path';

      const result = sanitization.sanitizePath(absolutePath, {
        rootDir,
        allowAbsolute: true,
      });
      expect(result.sanitizedPath).toBe('deep/nested/path');
    });

    describe('POSIX/Unix path handling', () => {
      it('should handle home directory paths', () => {
        const rootDir = '/home/user/projects';
        const absolutePath = '/home/user/projects/repo';

        const result = sanitization.sanitizePath(absolutePath, {
          rootDir,
          allowAbsolute: true,
        });
        expect(result.sanitizedPath).toBe('repo');
      });

      it('should reject paths attempting to escape via symlink-style traversal', () => {
        const rootDir = '/app/projects';
        // Even though this looks like it could be inside, the ../.. takes us out
        const escapePath = '/app/projects/../../etc/passwd';

        expect(() =>
          sanitization.sanitizePath(escapePath, {
            rootDir,
            allowAbsolute: true,
          }),
        ).toThrow(McpError);
      });

      it('should handle paths with redundant slashes', () => {
        const rootDir = '/app/projects';
        const pathWithSlashes = '/app/projects//repo///file.txt';

        const result = sanitization.sanitizePath(pathWithSlashes, {
          rootDir,
          allowAbsolute: true,
        });
        // path.normalize handles redundant slashes
        expect(result.sanitizedPath).toBe('repo/file.txt');
      });

      it('should handle paths with dot segments', () => {
        const rootDir = '/app/projects';
        const pathWithDots = '/app/projects/./repo/./file.txt';

        const result = sanitization.sanitizePath(pathWithDots, {
          rootDir,
          allowAbsolute: true,
        });
        expect(result.sanitizedPath).toBe('repo/file.txt');
      });

      it('should handle relative paths with rootDir', () => {
        const rootDir = '/app/projects';
        const relativePath = 'my-repo/src';

        const result = sanitization.sanitizePath(relativePath, { rootDir });
        expect(result.sanitizedPath).toBe('my-repo/src');
      });

      it('should reject relative path traversal outside rootDir', () => {
        const rootDir = '/app/projects';
        const escapePath = '../../etc/passwd';

        expect(() =>
          sanitization.sanitizePath(escapePath, { rootDir }),
        ).toThrow(McpError);
      });
    });
  });

  describe('sanitizeForLogging', () => {
    it('should redact sensitive keys like "password", "token", and "apiKey" in a flat object', () => {
      const sensitiveObject = {
        username: 'test',
        password: 'my-secret-password',
        session_token: 'abc-123',
        secretKey: 'xyz-789',
      };
      const sanitized = sanitization.sanitizeForLogging(
        sensitiveObject,
      ) as Record<string, unknown>;
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.session_token).toBe('[REDACTED]');
      expect(sanitized.secretKey).toBe('[REDACTED]');
      expect(sanitized.username).toBe('test');
    });

    it('should redact sensitive keys in a deeply nested object', () => {
      const sensitiveObject = {
        user: 'casey',
        credentials: {
          password: 'my-secret-password',
          session_token: 'abc-123-def-456',
        },
        nonSensitive: 'data',
      };
      const sanitized = sanitization.sanitizeForLogging(
        sensitiveObject,
      ) as Record<string, unknown>;
      expect(sanitized).toBeDefined();
      if (
        sanitized &&
        typeof sanitized === 'object' &&
        'credentials' in sanitized
      ) {
        const creds = sanitized.credentials as Record<string, unknown>;
        expect(creds.password).toBe('[REDACTED]');
        expect(creds.session_token).toBe('[REDACTED]');
      }
      expect((sanitized as Record<string, unknown>).nonSensitive).toBe('data');
    });

    it('should not modify non-sensitive keys', () => {
      const nonSensitive = { user: 'casey', id: 123 };
      const sanitized = sanitization.sanitizeForLogging(nonSensitive);
      expect(sanitized).toEqual(nonSensitive);
    });

    it('should handle arrays of objects correctly', () => {
      const sensitiveArray = [
        { user: 'a', password: '123' },
        { user: 'b', apiKey: '456' },
      ];
      const sanitized = sanitization.sanitizeForLogging(
        sensitiveArray,
      ) as Record<string, unknown>[];

      expect(sanitized).toBeDefined();
      expect(Array.isArray(sanitized)).toBe(true);

      if (Array.isArray(sanitized)) {
        expect(sanitized[0]).toBeDefined();
        expect(sanitized[1]).toBeDefined();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        expect(sanitized[0]!.password).toBe('[REDACTED]');
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        expect(sanitized[1]!.apiKey).toBe('[REDACTED]');
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        expect(sanitized[0]!.user).toBe('a');
      }
    });

    it('should handle edge case where nested property is undefined', () => {
      const sensitiveObject = {
        user: 'casey',
        nonSensitive: 'data',
      };
      const sanitized = sanitization.sanitizeForLogging(
        sensitiveObject,
      ) as Record<string, unknown>;
      expect(sanitized).toBeDefined();
      expect((sanitized as Record<string, unknown>).nonSensitive).toBe('data');
    });
  });

  // Adding tests for other public methods to ensure full coverage
  describe('sanitizeUrl', () => {
    it('should return a valid URL', () => {
      const url = 'https://example.com';
      expect(sanitization.sanitizeUrl(url)).toBe(url);
    });

    it('should throw for invalid URL', () => {
      const url = 'not-a-url';
      expect(() => sanitization.sanitizeUrl(url)).toThrow(McpError);
    });

    it('should throw for disallowed protocols', () => {
      const url = 'ftp://example.com';
      expect(() => sanitization.sanitizeUrl(url)).toThrow(McpError);
    });
  });

  describe('sanitizeJson', () => {
    it('should parse a valid JSON string', () => {
      const json = '{"key": "value"}';
      expect(sanitization.sanitizeJson(json)).toEqual({ key: 'value' });
    });

    it('should throw for an invalid JSON string', () => {
      const json = '{"key": "value"';
      expect(() => sanitization.sanitizeJson(json)).toThrow(McpError);
    });

    it('should throw if JSON size exceeds maxSize', () => {
      const json = '{"key": "value"}';
      expect(() => sanitization.sanitizeJson(json, 5)).toThrow(McpError);
    });
  });

  describe('sanitizeNumber', () => {
    it('should return a valid number', () => {
      expect(sanitization.sanitizeNumber(123)).toBe(123);
      expect(sanitization.sanitizeNumber('123.45')).toBe(123.45);
    });

    it('should throw for an invalid number string', () => {
      expect(() => sanitization.sanitizeNumber('abc')).toThrow(McpError);
    });

    it('should clamp number to min/max range', () => {
      expect(sanitization.sanitizeNumber(5, 10, 20)).toBe(10);
      expect(sanitization.sanitizeNumber(25, 10, 20)).toBe(20);
    });
  });

  describe('setSensitiveFields and getSensitiveFields', () => {
    it('should allow adding and retrieving sensitive fields', () => {
      const initialFields = sanitization.getSensitiveFields();
      sanitization.setSensitiveFields(['customSecret', 'customToken']);
      const updatedFields = sanitization.getSensitiveFields();
      expect(updatedFields).toContain('customsecret');
      expect(updatedFields).toContain('customtoken');
      expect(updatedFields.length).toBeGreaterThan(initialFields.length);
    });

    it('should return pino-compliant field names', () => {
      const pinoFields = sanitization.getSensitivePinoFields();
      expect(Array.isArray(pinoFields)).toBe(true);
      // Pino fields should not contain hyphens or underscores
      pinoFields.forEach((field) => {
        expect(field).not.toContain('-');
        expect(field).not.toContain('_');
      });
    });
  });
});
