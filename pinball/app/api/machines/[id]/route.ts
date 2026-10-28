import { NextResponse } from 'next/server';
import { withTenant } from '@/lib/db/tenant';
import * as repo from '@/lib/db/repo';
import { getCurrentTenantId } from '@/lib/auth/session';
import { MachineSchema } from '@/lib/schemas';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/machines/[id] */
export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = await getCurrentTenantId();
  const machine = await withTenant(tenantId, (tx) => repo.getMachine(tx, id));
  if (!machine) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ machine });
}

/** PATCH /api/machines/[id] */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = await getCurrentTenantId();
  const body = await request.json().catch(() => null);
  const parsed = MachineSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }
  const machine = await withTenant(tenantId, (tx) => repo.updateMachine(tx, id, parsed.data));
  return NextResponse.json({ machine });
}

/** DELETE /api/machines/[id]：级联删 Session/Round/Posterior/SimParams/BanditArm/McSimCache */
export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = await getCurrentTenantId();
  await withTenant(tenantId, (tx) => repo.deleteMachine(tx, id));
  return new NextResponse(null, { status: 204 });
}
