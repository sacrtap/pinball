import { Queue, type Job } from 'bullmq';
import IORedis from 'ioredis';

/** BullMQ 复用同一 Redis 连接配置 */
export function redisConnection() {
  return new IORedis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
  });
}

export const MONTECARLO_QUEUE = 'montecarlo';

export interface MonteCarloJob {
  tenantId: string;
  machineId: string;
  power: string;
  fitVersion: number;
}

/** 入队（不阻塞请求路径） */
export async function enqueueMonteCarlo(job: MonteCarloJob): Promise<void> {
  const queue = new Queue(MONTECARLO_QUEUE, { connection: redisConnection() });
  try {
    await queue.add('refit', job, {
      jobId: `${job.machineId}:${job.power}:${job.fitVersion}`,
      removeOnComplete: true,
      removeOnFail: 100,
    });
  } finally {
    await queue.close();
  }
}

export type MonteCarloJobType = Job<MonteCarloJob>;
