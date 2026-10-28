import { NextResponse } from 'next/server';
import { withTenant } from '@/lib/db/tenant';
import * as repo from '@/lib/db/repo';
import { getCurrentTenantId } from '@/lib/auth/session';
import { SessionSchema } from '@/lib/schemas';

/** GET /api/sessions?machineId= */
export async function GET(request: Request) {
  const tenantId = await getCurrentTenantId();
  const machineId = new URL(request.url).searchParams.get('machineId') ?? undefined;
  const sessions = await withTenant(tenantId, (tx) => repo.listSessions(tx, machineId));
  return NextResponse.json({ sessions });
}

/** POST /api/sessions：建 Session */
export async function POST(request: Request) {
  const tenantId = await getCurrentTenantId();
  const body = await request.json().catch(() => null);
  const parsed = SessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }
  const session = await withTenant(tenantId, (tx) =>
    repo.createSession(tx, { tenantId, machineId: parsed.data.machineId }),
  );
  return NextResponse.json({ session }, { status: 201 });
}
