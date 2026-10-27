import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { withTenant } from '@/lib/db/tenant';
import { recommend, type RecommendResult } from '@/lib/predict/bandit';
import { aggregateGlobalPrior, alpha0TableFrom, priorDist } from '@/lib/predict/pooling';
import { litCountFor, isValidHole, SAMPLE_THRESHOLD } from '@/lib/rules';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  machineId: z.string().uuid(),
  multiplier: z.union([z.literal(2), z.literal(4), z.literal(6), z.literal(8), z.literal(10)]),
  litHoles: z.array(z.number().int().min(1).max(12)).min(1).max(12),
  totalBet: z.number().int().nonnegative().optional(),
});

/** POST 推荐：<20 局降级为先验；≥20 → Thompson 双轨 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.tenantId) return NextResponse.json({ error: '未认证' }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: '参数错误', issues: parsed.error.issues }, { status: 400 });
  }
  const { machineId, multiplier, litHoles, totalBet } = parsed.data;

  if (litHoles.length !== litCountFor(multiplier)) {
    return NextResponse.json(
      { error: `倍率 ${multiplier} 需要 ${litCountFor(multiplier)} 个亮灯通道` },
      { status: 400 },
    );
  }
  if (!litHoles.every(isValidHole) || new Set(litHoles).size !== litHoles.length) {
    return NextResponse.json({ error: '亮灯通道非法或重复' }, { status: 400 });
  }

  // L4 先验聚合走 BYPASSRLS 独立连接，须在事务外（读已提交数据）
  const priorRows = await aggregateGlobalPrior();
  const alpha0Table = alpha0TableFrom(priorRows);

  const result = await withTenant(session.tenantId, async (tx) => {
    const posteriors = await tx.posterior.findMany({ where: { machineId } });
    const sampleN = posteriors.reduce((s, p) => s + p.counts.reduce((a, b) => a + b, 0), 0);

    if (sampleN < SAMPLE_THRESHOLD) {
      return {
        mode: 'prior' as const,
        degraded: true,
        sampleN,
        message: `样本不足（${sampleN}/${SAMPLE_THRESHOLD}），已降级为先验`,
        prior: {
          channelProb: priorDist(priorRows.find((r) => r.power === 'mid')),
          alpha0Table,
        },
      };
    }

    const rec = await recommend(tx, machineId, session.tenantId!, litHoles, {
      totalBet,
      multiplier,
      alpha0Table,
    });
    return { mode: 'thompson' as const, ...rec, sampleN };
  });

  return NextResponse.json(result satisfies Partial<RecommendResult> & Record<string, unknown>);
}
