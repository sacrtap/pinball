import { test, expect } from '@playwright/test';

/**
 * E2E 录入流（390×844）：
 * 建机台 → 建 Session → 录 3 局 → 校验 session 统计；
 * 断网录 2 局 → 恢复 → 自动同步不重复。
 * 账号经 /api/test/register 直建（跳过 OTP 邮件流；OTP 链路由单测覆盖）。
 */

const stamp = Date.now();
const email = `e2e-${stamp}@pinball.local`;
const password = 'e2e-password-123';

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

    // 录 3 局：倍率2 → 亮灯5 → 点「确定」→ 发力（选完自动前进）→ 落点 → 判定同屏 → 提交
    for (let i = 0; i < 3; i += 1) {
      await page.click('button:has-text("2×")');
      for (const hole of [1, 2, 3, 4, 5]) {
        await page.click(`button[aria-label="亮灯 ${hole} 号洞"]`);
      }
      await page.click('button:has-text("确定")'); // → 发力与加注（亮灯选满后显式确认）
      // 步骤断言用「当前步骤独有控件」而非标题文本：afe0758 删掉 "N/3 标题" 后
      // 旧标题断言全部失效（漂移），控件存在性同时验证了步骤与渲染完整性
      // step1 独有：加注数字键盘（step0/step2 均不存在）
      await expect(page.locator('button[aria-label="清空"]')).toBeVisible({ timeout: 10_000 });
      await page.click('button:has-text("小力")');
      // step2 独有：落点态洞位板（aria-label 前缀「落点」）
      await expect(page.locator('button[aria-label="落点 3 号洞"]')).toBeVisible();
      await page.click('button[aria-label="落点 3 号洞"]');
      await expect(page.locator('text=命中')).toBeVisible();
      await page.click('button:has-text("提交本局")');
      // 软重置回 step0：亮灯态洞位板重新出现
      await expect(page.locator('button[aria-label="亮灯 1 号洞"]')).toBeVisible({ timeout: 10_000 });
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
      await page.click('button:has-text("确定")');
      await expect(page.locator('button[aria-label="清空"]')).toBeVisible({ timeout: 10_000 });
      await page.click('button:has-text("小力")');
      await expect(page.locator('button[aria-label="落点 3 号洞"]')).toBeVisible();
      await page.click('button[aria-label="落点 3 号洞"]');
      await expect(page.locator('text=命中')).toBeVisible();
      await page.click('button:has-text("提交本局")');
      await expect(page.locator('button[aria-label="亮灯 1 号洞"]')).toBeVisible({ timeout: 10_000 });
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

  // 回归：自动前进 effect 曾让 step1「上一步」被立即弹回（用户报告：无法返回上一页）
  test('step1 上一步 → 停留 step0 且亮灯保留，确定后再前进', async ({ page, request }) => {
    const reg = await request.post('/api/test/register', { data: { email, password } });
    expect(reg.ok()).toBeTruthy();
    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button:has-text("登录")');
    await expect(page).toHaveURL(/\/($|\?)/, { timeout: 15_000 });

    await page.goto('/machine/new');
    await page.fill('input >> nth=0', `E2E-${stamp}-C`);
    await page.click('button:has-text("创建机台")');
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

    await page.click(`text=E2E-${stamp}-C`);
    await page.click('button:has-text("开始新对局")');
    await expect(page).toHaveURL(/\/session\/.+\/play/, { timeout: 15_000 });

    // step0：倍率 2× + 乱序选满 → 「确定」→ step1
    await page.click('button:has-text("2×")');
    for (const hole of [1, 3, 6, 11, 5]) {
      await page.click(`button[aria-label="亮灯 ${hole} 号洞"]`);
    }
    await page.click('button:has-text("确定")');
    await expect(page.locator('button[aria-label="清空"]')).toBeVisible({ timeout: 10_000 });

    // step1 点「上一步」→ 必须停留 step0（曾因亮灯仍满被 effect 弹回）
    await page.click('button:has-text("上一步")');
    await expect(page.locator('button[aria-label="清空"]')).toHaveCount(0); // step1 控件已消失
    await expect(page.locator('text=选择 5 个亮灯通道（已选 5/5）')).toBeVisible();
    await expect(page.locator('button[aria-label="亮灯 1 号洞"][aria-pressed="true"]')).toBeVisible();
    await expect(page.locator('button:has-text("2×")[aria-pressed="true"]')).toBeVisible();

    // 取消一个亮灯 → 「确定」禁用（未选满不可前进）
    await page.click('button[aria-label="亮灯 1 号洞"]');
    await expect(page.locator('button:has-text("确定")')).toBeDisabled();
    await page.click('button[aria-label="亮灯 1 号洞"]');

    // 再点「确定」→ 回到 step1
    await page.click('button:has-text("确定")');
    await expect(page.locator('button[aria-label="清空"]')).toBeVisible({ timeout: 10_000 });
  });
});
