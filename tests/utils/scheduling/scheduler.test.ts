/**
 * @fileoverview Unit tests for the scheduler service built on node-cron.
 * @module tests/utils/scheduling/scheduler.test
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { trace } from '@opentelemetry/api';
import * as cron from 'node-cron';

import { logger } from '../../../src/utils/internal/logger.js';

const validateMock = vi.fn(() => true);
const createTaskMock = vi.fn(
  (schedule: string, handler: () => Promise<void> | void) => {
    return {
      start: vi.fn(),
      stop: vi.fn(),
      trigger: () => handler(),
      schedule,
    } as unknown as {
      start: () => void;
      stop: () => void;
      trigger: () => Promise<void> | void;
    };
  },
);

let validateSpy: MockInstance;
let createTaskSpy: MockInstance;

type SchedulerModule =
  typeof import('../../../src/utils/scheduling/scheduler.js');
let schedulerService: SchedulerModule['schedulerService'];

describe('schedulerService', () => {
  let infoSpy: MockInstance;
  let warningSpy: MockInstance;
  let errorSpy: MockInstance;
  let getActiveSpanSpy: MockInstance;

  beforeEach(async () => {
    createTaskMock.mockClear();
    validateMock.mockClear();
    infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    warningSpy = vi.spyOn(logger, 'warning').mockImplementation(() => {});
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    getActiveSpanSpy = vi.spyOn(trace, 'getActiveSpan').mockReturnValue({
      spanContext: () => ({ traceId: 'trace', spanId: 'span' }),
    } as never);

    validateSpy = vi
      .spyOn(cron, 'validate')
      .mockImplementation(validateMock as never);
    createTaskSpy = vi
      .spyOn(cron, 'createTask')
      .mockImplementation(createTaskMock as never);

    const module: SchedulerModule =
      await import('../../../src/utils/scheduling/scheduler.js');
    schedulerService = module.schedulerService;
    (
      schedulerService as unknown as { jobs: Map<string, unknown> }
    ).jobs.clear();
  });

  afterEach(() => {
    infoSpy.mockRestore();
    warningSpy.mockRestore();
    errorSpy.mockRestore();
    getActiveSpanSpy.mockRestore();
    validateSpy?.mockRestore();
    createTaskSpy?.mockRestore();
    if (schedulerService) {
      (
        schedulerService as unknown as { jobs: Map<string, unknown> }
      ).jobs.clear();
    }
  });

  it('refuses to schedule when the cron expression is invalid', () => {
    validateMock.mockReturnValueOnce(false);

    expect(() =>
      schedulerService.schedule(
        'invalid',
        'bad pattern',
        () => undefined,
        'Bad job',
      ),
    ).toThrowError('Invalid cron schedule: bad pattern');
  });

  it('schedules a job, runs it successfully, and logs lifecycle events', async () => {
    const handler = vi.fn();
    const job = schedulerService.schedule(
      'job-1',
      '* * * * *',
      handler,
      'Test job',
    );

    expect(validateMock).toHaveBeenCalledWith('* * * * *');
    expect(createTaskMock).toHaveBeenCalledTimes(1);
    expect(job.isRunning).toBe(false);
    expect(infoSpy).toHaveBeenCalledWith(
      "Job 'job-1' scheduled: Test job",
      expect.any(Object),
    );

    await (
      job.task as unknown as { trigger: () => Promise<void> | void }
    ).trigger();

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-1', schedule: '* * * * *' }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "Job 'job-1' completed successfully.",
      expect.objectContaining({ jobId: 'job-1' }),
    );
    expect(job.isRunning).toBe(false);
  });

  it('prevents overlapping executions by logging a warning', async () => {
    const job = schedulerService.schedule(
      'job-overlap',
      '* * * * *',
      () => undefined,
      'Overlap',
    );

    job.isRunning = true;
    await (
      job.task as unknown as { trigger: () => Promise<void> | void }
    ).trigger();

    expect(warningSpy).toHaveBeenCalledWith(
      "Job 'job-overlap' is already running. Skipping this execution.",
      expect.objectContaining({
        requestId: expect.stringMatching(/^job-skip-/),
      }),
    );
  });

  it('captures errors thrown by the scheduled handler', async () => {
    const failure = new Error('boom');
    const job = schedulerService.schedule(
      'job-fail',
      '* * * * *',
      () => {
        throw failure;
      },
      'Should fail',
    );

    await (
      job.task as unknown as { trigger: () => Promise<void> | void }
    ).trigger();

    expect(errorSpy).toHaveBeenCalledWith(
      "Job 'job-fail' failed.",
      failure,
      expect.objectContaining({ jobId: 'job-fail' }),
    );
    expect(job.isRunning).toBe(false);
  });

  it('supports start, stop, and remove operations on jobs', () => {
    const job = schedulerService.schedule(
      'job-control',
      '* * * * *',
      () => undefined,
      'Control',
    );
    const task = job.task as unknown as {
      start: MockInstance;
      stop: MockInstance;
    };

    schedulerService.start('job-control');
    expect(task.start).toHaveBeenCalled();

    schedulerService.stop('job-control');
    expect(task.stop).toHaveBeenCalled();

    schedulerService.remove('job-control');
    expect(infoSpy).toHaveBeenCalledWith(
      "Job 'job-control' removed.",
      expect.objectContaining({ requestId: 'job-remove-job-control' }),
    );
    expect(
      (schedulerService as unknown as { jobs: Map<string, unknown> }).jobs.has(
        'job-control',
      ),
    ).toBe(false);
  });

  it('rejects duplicate job identifiers', () => {
    schedulerService.schedule(
      'job-duplicate',
      '* * * * *',
      () => undefined,
      'First',
    );

    expect(() =>
      schedulerService.schedule(
        'job-duplicate',
        '* * * * *',
        () => undefined,
        'Second',
      ),
    ).toThrowError("Job with ID 'job-duplicate' already exists.");
  });
});
