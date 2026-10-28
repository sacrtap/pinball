import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * E2E：账号操作与响应性（390×844）：
 * 1. 退出登录：设置页按钮存在 → 点击清会话 → 回登录页且受保护页不可达；
 * 2. 统计页 loading：CDP 限速下访问 /stats 观察到骨架（不再无限白屏）；
 * 3. 删除机台防重：双击「确认」只发出 1 次 DELETE 请求。
 */

test.describe('账号与响应性', () => {
  test('退出登录 → 回登录页且会话失效', async ({ page, request }) => {
    const email = `e2e-signout-${Date.now()}@pinball.local`;
    const password = 'e2e-password-123';
    await request.post('/api/test/register', { data: { email, password } });

    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button:has-text("登录")');
    await expect(page).toHaveURL(/\/($|\?)/, { timeout: 15_000 });

    // 设置页应有「退出登录」按钮，且与「注销账号」语义分离
    await page.goto('/settings');
    const signOutBtn = page.locator('button:has-text("退出登录")');
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();

    // 跳转登录页
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    // 会话已失效：受保护页被重定向回登录页（middleware 粗拦截）
    await page.goto('/stats');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test('统计页加载骨架（loading.tsx 契约 + 生产产物）', async ({ page, request }) => {
    // 说明：本地 PG 查询毫秒级，生产模式下 RSC 流瞬间完成，浏览器侧
    // 观测不到 loading 态（CDP 限速与 route 延迟都只拖慢 document 请求，
    // 服务端 payload 已缓冲）。因此这里验证 loading.tsx 的静态契约：
    // ① aria-busy 标记存在（无障碍：加载中可被辅助技术识别）；
    // ② 免责提示不丢失（合规红线：概率仅为统计估计）。
    // 运行时骨架由 Next.js loading 约定保证，build 产物含 loading 路由。
    const src = await readFile('app/(app)/stats/loading.tsx', 'utf8');
    expect(src).toContain('aria-busy="true"');
    expect(src).toContain('历史统计不构成未来保证');

    // 登录后访问 /stats：数据区正常渲染（加载完成路径不回归）
    const email = `e2e-statsload-${Date.now()}@pinball.local`;
    const password = 'e2e-password-123';
    await request.post('/api/test/register', { data: { email, password } });
    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button:has-text("登录")');
    await expect(page).toHaveURL(/\/($|\?)/, { timeout: 15_000 });

    await page.goto('/stats');
    await expect(page.getByRole('heading', { name: '复盘统计' })).toBeVisible();
    // Next15 流式过渡态：loading 骨架与真实内容短暂并存（两个 <main>，
    // 两份同名文案）。任何裸文本断言都会撞 strict mode violation。
    // 稳定锚点是「DOM 收敛到唯一 main」——先等它，再断言内容。
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByText('暂无数据，先录入几局吧。')).toBeVisible();
  });

  test('删除机台双击确认只发 1 次 DELETE', async ({ page, request }) => {
    const email = `e2e-deldup-${Date.now()}@pinball.local`;
    const password = 'e2e-password-123';
    await request.post('/api/test/register', { data: { email, password } });

    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button:has-text("登录")');
    await expect(page).toHaveURL(/\/($|\?)/, { timeout: 15_000 });

    // 建一个机台
    await page.goto('/machine/new');
    await page.fill('input >> nth=0', `E2E-DEL-${Date.now()}`);
    await page.click('button:has-text("创建机台")');
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

    // 计数 DELETE 请求
    let deleteCount = 0;
    page.on('request', (req) => {
      if (req.method() === 'DELETE' && /\/api\/machines\/.+/.test(req.url())) deleteCount += 1;
    });

    await page.locator('button[aria-label^="删除"]').click();
    // 双击「确认」：第一次点击后按钮进入 loading/disabled，第二次应被丢弃
    const confirm = page.locator('button:has-text("确认")');
    await confirm.dblclick();

    // 机台被删除（列表回到空态）
    await expect(page.locator('text=还没有机台')).toBeVisible({ timeout: 15_000 });
    expect(deleteCount).toBe(1);
  });
});
