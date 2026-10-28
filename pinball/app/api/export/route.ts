import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { withTenant } from '@/lib/db/tenant';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** GET 导出本租户全量（JSON 默认；?format=csv 各表 CSV 打包为文本） */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.tenantId || !session.userId) {
    return NextResponse.json({ error: '未认证' }, { status: 401 });
  }

  const format = new URL(req.url).searchParams.get('format') ?? 'json';

  const data = await withTenant(session.tenantId, async (tx) => {
    const [machines, sessions, rounds] = await Promise.all([
      tx.machine.findMany(),
      tx.session.findMany(),
      tx.round.findMany({ orderBy: { createdAt: 'asc' } }),
    ]);
    await logAudit(tx, session.tenantId!, session.userId ?? null, 'export', {
      format,
      machines: machines.length,
      sessions: sessions.length,
      rounds: rounds.length,
    });
    return { machines, sessions, rounds };
  });

  if (format === 'csv') {
    const csv = [
      toCsv('machines', data.machines),
      toCsv('sessions', data.sessions),
      toCsv('rounds', data.rounds),
    ].join('\n\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="pinball-export.csv"',
      },
    });
  }

  return NextResponse.json(
    { exportedAt: new Date().toISOString(), ...data },
    {
      headers: {
        'Content-Disposition': 'attachment; filename="pinball-export.json"',
      },
    },
  );
}

function toCsv(name: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return `# ${name}\n`;
  const headers = Object.keys(rows[0]);
  const lines = [`# ${name}`, headers.join(',')];
  for (const r of rows) {
    lines.push(
      headers
        .map((h) => {
          const v = r[h];
          if (v === null || v === undefined) return '';
          if (Array.isArray(v)) return `"${JSON.stringify(v).replace(/"/g, '""')}"`;
          if (v instanceof Date) return v.toISOString();
          const s = String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    );
  }
  return lines.join('\n');
}
