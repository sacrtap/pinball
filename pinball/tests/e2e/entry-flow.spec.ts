import { test, expect } from '@playwright/test';

/**
 * E2E 录入流（390×844）：
 * 注册 → 建机台 → 建 Session → 录 3 局 → 校验 session 统计；
 * 断网录 2 局 → 恢复 → 自动同步不重复。
 */

const stamp = Date.now();
const email = `e2e-${stamp}@pinball.local`;
const password = 'e2e-password-123';

/**
 * E2E 录入流（390×844）：
 * 建机台 → 建 Session → 录 3 局 → 校验 session 统计；
 * 断网录 2 局 → 恢复 → 自动同步不重复。
 * 账号经 /api/test/register 直建（跳过 OTP 邮件流；OTP 链路由单测覆盖）。
 */

test.describe('录入流', () => {
  test('建机台 → 建 Session → 录 3 局统计正确', async ({ page, request }) => {
    // 建测试账号 + 登录
    const reg = await request.post('/api/test/register', { data: { email, password } });
    expect(reg.ok()).toBeTruthy();

    // 登录（凭据）
    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button:has-text("登录")');
    await expect(page).toHaveURL(/\/($|\?)/, { timeout: 15_000 });

    // 建机台
    await page.goto('/machine/new');
    await page.fill('input >> nth=0', `E2E-${stamp}`);
    await page.click('button:has-text("创建机台")');
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

    // 进第一个机台 → 开始对局
    await page.click('text=E2E-');
    await page.click('button:has-text("开始新对局")');
    await expect(page).toHaveURL(/\/session\/.+\/play/, { timeout: 15_000 });

    // 录 3 局：倍率2 → 亮灯5 → 跳过加注 → 发力 → 落点 → 命中
    for (let i = 0; i < 3; i += 1) {
      await page.click('button:has-text("2×")');
      for (const hole of [1, 2, 3, 4, 5]) {
        await page.click(`button[aria-label="亮灯 ${hole} 号洞"]`);
      }
      await page.click('button:has-text("下一步")'); // → 加注
      await page.click('button:has-text("下一步")'); // → 发力
      await page.click('button:has-text("小力")');
      await page.click('button:has-text("下一步")'); // → 落点
      await page.click('button[aria-label="落点 3 号洞"]');
      await page.click('button:has-text("下一步")'); // → 确认
      await page.click('button:has-text("命中")');
      await page.click('button:has-text("提交本局")');
      await expect(page.locator('text=1/6 选择倍率')).toBeVisible({ timeout: 10_000 });
    }

    // 校验累计：3 局（Stat 结构：label 文本节点的下一个兄弟 div）
    const stat = page.locator('div.text-\\[10px\\]', { hasText: '局数' }).first();
    await expect(stat.locator('+ div')).toHaveText('3');
  });

  test('断网录 2 局 → 恢复 → 自动同步不重复', async ({ page, context, request }) => {
    // 复用同一账号登录
    await request.post('/api/test/register', { data: { email, password } });
    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button:has-text("登录")');
    await expect(page).toHaveURL(/\/($|\?)/, { timeout: 15_000 });

    // 建机台（与首个 test 相同账号，本 context 独立；code 加后缀避免撞唯一约束）
    await page.goto('/machine/new');
    await page.fill('input >> nth=0', `E2E-${stamp}-B`);
    await page.click('button:has-text("创建机台")');
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

    await page.click(`text=E2E-${stamp}-B`);
    await page.click('button:has-text("开始新对局")');
    await expect(page).toHaveURL(/\/session\/.+\/play/);

    // 断网
    await context.setOffline(true);
    for (let i = 0; i < 2; i += 1) {
      await page.click('button:has-text("2×")');
      for (const hole of [1, 2, 3, 4, 5]) {
        await page.click(`button[aria-label="亮灯 ${hole} 号洞"]`);
      }
      await page.click('button:has-text("下一步")');
      await page.click('button:has-text("下一步")');
      await page.click('button:has-text("小力")');
      await page.click('button:has-text("下一步")');
      await page.click('button[aria-label="落点 3 号洞"]');
      await page.click('button:has-text("下一步")');
      await page.click('button:has-text("命中")');
      await page.click('button:has-text("提交本局")');
      await expect(page.locator('text=1/6 选择倍率')).toBeVisible({ timeout: 10_000 });
    }

    // 暂存提示
    await expect(page.locator('text=局已暂存，恢复网络后自动同步')).toBeVisible();

    // 恢复网络 → 自动同步
    await context.setOffline(false);
    await page.reload();
    await expect(page.locator('text=局已暂存，恢复网络后自动同步')).toBeHidden({ timeout: 15_000 });

    // 不重复：本 session 仅离线 2 局 → 同步后局数 = 2（若重复提交则为 4）
    const stat = page.locator('div.text-\\[10px\\]', { hasText: '局数' }).first();
    await expect(stat.locator('+ div')).toHaveText('2', { timeout: 15_000 });
  });
});
