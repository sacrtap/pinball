import IORedis from 'ioredis';

/**
 * 基于 Redis 的滑动窗口限流（ZSET 精确窗口）。
 * 无 Redis 时放行（降级不阻断主流程）。
 */

let client: IORedis | null = null;

function redis(): IORedis | null {
  if (client) return client;
  try {
    client = new IORedis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    client.on('error', () => {});
  } catch {
    client = null;
  }
  return client;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const r = redis();
  if (!r) return { ok: true, remaining: limit, resetAt: Date.now() + windowMs };

  const now = Date.now();
  const windowStart = now - windowMs;
  const member = `${now}-${Math.random()}`;
  try {
    const multi = r.multi();
    multi.zremrangebyscore(key, 0, windowStart);
    multi.zadd(key, now, member);
    multi.zcard(key);
    multi.pexpire(key, windowMs);
    const results = await multi.exec();
    const count = Number(results?.[2]?.[1] ?? 0);
    return {
      ok: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: now + windowMs,
    };
  } catch {
    return { ok: true, remaining: limit, resetAt: now + windowMs };
  }
}

/** 登录限流：每邮箱每分钟 5 次 */
export function loginRateLimit(email: string) {
  return rateLimit(`rl:login:${email.toLowerCase()}`, 5, 60_000);
}

/** 录入限流：每租户每秒 20 次 */
export function entryRateLimit(tenantId: string) {
  return rateLimit(`rl:entry:${tenantId}`, 20, 1_000);
}
