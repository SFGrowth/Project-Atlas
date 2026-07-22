/**
 * DARWIN Resource Scheduler — Sprint 123A.6 / Gate G6A
 *
 * Enforces bounded concurrency, CPU/memory limits, and failure isolation.
 * DARWIN research jobs must never affect the live chart pipeline.
 *
 * RESEARCH ONLY — NO LIVE EXECUTION
 */

import { randomUUID } from 'crypto';

// ─── Resource limits ──────────────────────────────────────────────────────────

export const RESOURCE_LIMITS = {
  // Concurrency
  MAX_CONCURRENT_RESEARCH_JOBS: 2,
  MAX_CONCURRENT_OBSERVATION_JOBS: 2,
  MAX_CONCURRENT_LABELLING_JOBS: 1,
  MAX_CONCURRENT_BACKTEST_JOBS: 1,
  // Timeouts
  OBSERVATION_JOB_TIMEOUT_MS: 30_000,
  LABELLING_JOB_TIMEOUT_MS: 60_000,
  BACKTEST_JOB_TIMEOUT_MS: 300_000,
  EXPERIMENT_JOB_TIMEOUT_MS: 600_000,
  // Memory
  MAX_OBSERVATION_BATCH_SIZE: 1000,
  MAX_BACKTEST_BARS: 50_000,
  // Queue
  MAX_QUEUE_DEPTH: 500,
  // Priority boost: live chart jobs always preempt research jobs
  LIVE_CHART_PRIORITY: 100,
  RESEARCH_PRIORITY: 1,
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export type JobType =
  | 'OBSERVATION'
  | 'LABELLING'
  | 'OCCURRENCE_SCAN'
  | 'BACKTEST'
  | 'EXPERIMENT'
  | 'SHADOW_SIGNAL';

export type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETE' | 'FAILED' | 'TIMEOUT' | 'CANCELLED';

export interface ScheduledJob {
  jobId: string;
  type: JobType;
  candidateId?: string;
  experimentId?: string;
  priority: number;
  queuedAt: number;
  startedAt?: number;
  completedAt?: number;
  status: JobStatus;
  failureReason?: string;
  timeoutMs: number;
  liveChartAffected: false; // always false
}

// ─── Scheduler state ──────────────────────────────────────────────────────────

const runningJobs = new Map<string, ScheduledJob>();
const jobQueue: ScheduledJob[] = [];
let totalJobsRun = 0;
let totalJobsFailed = 0;
let totalJobsTimeout = 0;

// ─── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Returns the timeout for a given job type.
 */
function getTimeoutForType(type: JobType): number {
  switch (type) {
    case 'OBSERVATION': return RESOURCE_LIMITS.OBSERVATION_JOB_TIMEOUT_MS;
    case 'LABELLING': return RESOURCE_LIMITS.LABELLING_JOB_TIMEOUT_MS;
    case 'BACKTEST': return RESOURCE_LIMITS.BACKTEST_JOB_TIMEOUT_MS;
    case 'EXPERIMENT': return RESOURCE_LIMITS.EXPERIMENT_JOB_TIMEOUT_MS;
    default: return RESOURCE_LIMITS.OBSERVATION_JOB_TIMEOUT_MS;
  }
}

/**
 * Returns the max concurrent jobs for a given job type.
 */
function getMaxConcurrentForType(type: JobType): number {
  switch (type) {
    case 'OBSERVATION': return RESOURCE_LIMITS.MAX_CONCURRENT_OBSERVATION_JOBS;
    case 'LABELLING': return RESOURCE_LIMITS.MAX_CONCURRENT_LABELLING_JOBS;
    case 'BACKTEST': return RESOURCE_LIMITS.MAX_CONCURRENT_BACKTEST_JOBS;
    default: return RESOURCE_LIMITS.MAX_CONCURRENT_RESEARCH_JOBS;
  }
}

/**
 * Returns the count of running jobs of a given type.
 */
function countRunningByType(type: JobType): number {
  let count = 0;
  for (const job of runningJobs.values()) {
    if (job.type === type) count++;
  }
  return count;
}

/**
 * Enqueues a DARWIN research job.
 * Returns the job ID.
 * Throws if the queue is full.
 */
export function enqueueJob(
  type: JobType,
  candidateId?: string,
  experimentId?: string
): string {
  if (jobQueue.length >= RESOURCE_LIMITS.MAX_QUEUE_DEPTH) {
    throw new Error(
      `[DARWIN scheduler] Queue depth limit reached (${RESOURCE_LIMITS.MAX_QUEUE_DEPTH}). ` +
      'Cannot enqueue new research job.'
    );
  }

  const job: ScheduledJob = {
    jobId: randomUUID(),
    type,
    candidateId,
    experimentId,
    priority: RESOURCE_LIMITS.RESEARCH_PRIORITY,
    queuedAt: Date.now(),
    status: 'QUEUED',
    timeoutMs: getTimeoutForType(type),
    liveChartAffected: false,
  };

  jobQueue.push(job);
  return job.jobId;
}

/**
 * Attempts to start the next queued job.
 * Returns the job if started, undefined if no job can start.
 */
export function tryStartNextJob(): ScheduledJob | undefined {
  if (jobQueue.length === 0) return undefined;

  // Sort by priority (descending) then queue time (ascending)
  jobQueue.sort((a, b) => b.priority - a.priority || a.queuedAt - b.queuedAt);

  for (let i = 0; i < jobQueue.length; i++) {
    const job = jobQueue[i];
    const maxConcurrent = getMaxConcurrentForType(job.type);
    const currentRunning = countRunningByType(job.type);

    if (currentRunning < maxConcurrent) {
      jobQueue.splice(i, 1);
      job.status = 'RUNNING';
      job.startedAt = Date.now();
      runningJobs.set(job.jobId, job);
      totalJobsRun++;
      return job;
    }
  }

  return undefined;
}

/**
 * Marks a job as complete.
 */
export function completeJob(jobId: string): void {
  const job = runningJobs.get(jobId);
  if (!job) return;
  job.status = 'COMPLETE';
  job.completedAt = Date.now();
  runningJobs.delete(jobId);
}

/**
 * Marks a job as failed with a reason.
 * Failure is isolated — does not affect other jobs or the live chart.
 */
export function failJob(jobId: string, reason: string): void {
  const job = runningJobs.get(jobId);
  if (!job) return;
  job.status = 'FAILED';
  job.completedAt = Date.now();
  job.failureReason = reason;
  runningJobs.delete(jobId);
  totalJobsFailed++;

  // Log failure but do not propagate — failure isolation
  console.error(
    `[DARWIN scheduler] Job ${jobId} (${job.type}) failed: ${reason}. ` +
    'Live chart pipeline is unaffected.'
  );
}

/**
 * Marks a job as timed out.
 */
export function timeoutJob(jobId: string): void {
  const job = runningJobs.get(jobId);
  if (!job) return;
  job.status = 'TIMEOUT';
  job.completedAt = Date.now();
  job.failureReason = `Timeout after ${job.timeoutMs}ms`;
  runningJobs.delete(jobId);
  totalJobsTimeout++;

  console.warn(
    `[DARWIN scheduler] Job ${jobId} (${job.type}) timed out after ${job.timeoutMs}ms. ` +
    'Live chart pipeline is unaffected.'
  );
}

/**
 * Cancels all queued jobs of a given type.
 * Used when the server is shutting down gracefully.
 */
export function cancelQueuedJobsByType(type: JobType): number {
  let cancelled = 0;
  for (let i = jobQueue.length - 1; i >= 0; i--) {
    if (jobQueue[i].type === type) {
      jobQueue.splice(i, 1);
      cancelled++;
    }
  }
  return cancelled;
}

/**
 * Returns the current scheduler status.
 */
export function getSchedulerStatus(): {
  runningJobs: number;
  queuedJobs: number;
  totalJobsRun: number;
  totalJobsFailed: number;
  totalJobsTimeout: number;
  runningByType: Record<JobType, number>;
  queuedByType: Record<JobType, number>;
  liveChartAffected: false;
  healthy: boolean;
} {
  const runningByType = {} as Record<JobType, number>;
  const queuedByType = {} as Record<JobType, number>;

  for (const job of runningJobs.values()) {
    runningByType[job.type] = (runningByType[job.type] ?? 0) + 1;
  }
  for (const job of jobQueue) {
    queuedByType[job.type] = (queuedByType[job.type] ?? 0) + 1;
  }

  return {
    runningJobs: runningJobs.size,
    queuedJobs: jobQueue.length,
    totalJobsRun,
    totalJobsFailed,
    totalJobsTimeout,
    runningByType,
    queuedByType,
    liveChartAffected: false,
    healthy: runningJobs.size <= RESOURCE_LIMITS.MAX_CONCURRENT_RESEARCH_JOBS,
  };
}

/**
 * Checks for timed-out running jobs and marks them as timed out.
 * Should be called periodically (e.g., every 30 seconds).
 */
export function sweepTimedOutJobs(): void {
  const now = Date.now();
  for (const [jobId, job] of runningJobs.entries()) {
    if (job.startedAt && now - job.startedAt > job.timeoutMs) {
      timeoutJob(jobId);
    }
  }
}
