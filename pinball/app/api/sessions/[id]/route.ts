import { NextResponse } from 'next/server';
import { withTenant } from '@/lib/db/tenant';
import * as repo from '@/lib/db/repo';
import { getCurrentTenantId } from '@/lib/auth/session';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/sessions/[id]：详情含 rounds */
export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = await getCurrentTenantId();
  const result = await withTenant(tenantId, async (tx) => {
    const session = await repo.getSession(tx, id);
    if (!session) return null;
    const rounds = await repo.listRounds(tx, id);
    return { session, rounds };
  });
  if (!result) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json(result);
}

/** PATCH /api/sessions/[id]：关闭 Session */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = await getCurrentTenantId();
  const body = await request.json().catch(() => {});
  if (body?.status !== 'closed') {
    return NextResponse.json({ error: 'UNSUPPORTED' }, { status: 400 });
  }
  const session = await withTenant(tenantId, (tx) => repo.closeSession(tx, id));
  return NextResponse.json({ session });
}
