import { NextResponse } from 'next/server';
import { withTenant } from '@/lib/db/tenant';
import * as repo from '@/lib/db/repo';
import { getCurrentTenantId } from '@/lib/auth/session';
import { MachineSchema } from '@/lib/schemas';

/** GET /api/machines：列表 */
export async function GET() {
  const tenantId = await getCurrentTenantId();
  const machines = await withTenant(tenantId, (tx) => repo.listMachines(tx));
  return NextResponse.json({ machines });
}

/** POST /api/machines：建机台 */
export async function POST(request: Request) {
  const tenantId = await getCurrentTenantId();
  const body = await request.json().catch(() => null);
  const parsed = MachineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_INPUT', issues: parsed.error.issues }, { status: 400 });
  }
  const machine = await withTenant(tenantId, (tx) => repo.createMachine(tx, { tenantId, ...parsed.data }));
  return NextResponse.json({ machine }, { status: 201 });
}
