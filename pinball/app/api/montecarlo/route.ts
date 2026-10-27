import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { withTenant } from '@/lib/db/tenant';
import { enqueueMonteCarlo } from '@/lib/queue/redis';
import { POWER_LEVELS } from '@/lib/rules';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  machineId: z.string().uuid(),
  power: z.enum(['low', 'mid', 'high']).optional(),
});

/** GET 读 McSimCache；无缓存 → 入队并返回 pending */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.tenantId) return NextResponse.json({ error: '未认证' }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    machineId: url.searchParams.get('machineId'),
    power: url.searchParams.get('power') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: '参数错误' }, { status: 400 });
  }
  const { machineId, power } = parsed.data;

  const powers = power ? [power] : [...POWER_LEVELS];

  const data = await withTenant(session.tenantId, async (tx) => {
    const caches = await tx.mcSimCache.findMany({
      where: { machineId, power: { in: powers } },
      orderBy: { fitVersion: 'desc' },
    });
    const params = await tx.simParams.findMany({
      where: { machineId, power: { in: powers } },
    });
    return { caches, params };
  });

  if (data.caches.length === 0) {
    // 无缓存：入队重拟合，返回 pending（前端轮询或下一局读到）
    const round = await withTenant(session.tenantId, (tx) =>
      tx.round.findFirst({
        where: { machineId },
        orderBy: { createdAt: 'desc' },
        select: { modelVersion: true },
      }),
    );
    const fitVersion = round?.modelVersion ?? 1;
    await Promise.all(
      powers.map((p) =>
        enqueueMonteCarlo({ tenantId: session.tenantId!, machineId, power: p, fitVersion }),
      ),
    );
    return NextResponse.json({ pending: true, fitVersion });
  }

  return NextResponse.json({
    pending: false,
    fitVersion: data.caches[0].fitVersion,
    results: data.caches.map((c) => ({
      power: c.power,
      fitVersion: c.fitVersion,
      dist: c.dist,
      stderr: c.stderr,
      computedAt: c.computedAt,
    })),
    params: data.params.map((p) => ({
      power: p.power,
      pegBias: p.pegBias,
      entryOffset: p.entryOffset,
      spread: p.spread,
      sampleN: p.sampleN,
      fittedAt: p.fittedAt,
    })),
  });
}
