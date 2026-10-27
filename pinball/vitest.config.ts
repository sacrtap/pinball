import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // 集成测试需真实 PostgreSQL（RLS / 事务），单测纯算法无需 DB
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://pinball_app:pinball_app_dev@127.0.0.1:5432/pinball_test?schema=public',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
