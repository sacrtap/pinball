import { Worker } from 'bullmq';
import { withTenant } from '@/lib/db/tenant';
import { fit, simulate } from '@/lib/predict/montecarlo';
import { MONTECARLO_QUEUE, redisConnection, type MonteCarloJob } from './redis';

/**
 * L2 蒙特卡洛 worker：fit → simulate N=10000 → upsert SimParams + McSimCache。
 * 由录入事务跨越 30/50/100 阈值时入队触发（不阻塞响应）。
 */

const MC_SIM_N = 10_000;

export function startMonteCarloWorker(): Worker<MonteCarloJob> {
  const worker = new Worker<MonteCarloJob>(
    MONTECARLO_QUEUE,
    async (job) => {
      const { tenantId, machineId, power, fitVersion } = job.data;

      const rounds = await withTenant(tenantId, (tx) =>
        tx.round.findMany({
          where: { machineId, power },
          select: { landHole: true, power: true },
        }),
      );
      const typed = rounds.map((r) => ({
        landHole: r.landHole,
        power: r.power as 'low' | 'mid' | 'high',
      }));
      if (rounds.length === 0) return { skipped: true };

      const fitted = fit(typed, `${machineId}:${fitVersion}`);
      const params = fitted[['low', 'mid', 'high'].indexOf(power)];
      if (!params) return { skipped: true };

      const sim = simulate(params, power as 'low' | 'mid' | 'high', MC_SIM_N, `${machineId}:${fitVersion}:${power}`);

      await withTenant(tenantId, async (tx) => {
        await tx.simParams.upsert({
          where: { tenantId_machineId_power: { tenantId, machineId, power } },
          create: {
            tenantId,
            machineId,
            power,
            pegBias: params.pegBias,
            entryOffset: params.entryOffset,
            spread: params.spread,
            sampleN: rounds.length,
          },
          update: {
            pegBias: params.pegBias,
            entryOffset: params.entryOffset,
            spread: params.spread,
            sampleN: rounds.length,
          },
        });

        await tx.mcSimCache.upsert({
          where: {
            tenantId_machineId_power_fitVersion: { tenantId, machineId, power, fitVersion },
          },
          create: { tenantId, machineId, power, fitVersion, dist: sim.dist, stderr: sim.stderr },
          update: { dist: sim.dist, stderr: sim.stderr },
        });
      });

      return { ok: true, sampleN: rounds.length };
    },
    { connection: redisConnection(), concurrency: 2 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[montecarlo] job ${job?.id} failed:`, err.message);
  });

  return worker;
}

// 直接执行（pnpm worker）
if (require.main === module) {
  const worker = startMonteCarloWorker();
  console.log('[montecarlo] worker started');
  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
