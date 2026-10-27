/** 常驻免责声明（PRD F5.3） */
export function DisclaimerBanner() {
  return (
    <div
      role="note"
      className="rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-2 text-xs text-[var(--fg)]"
    >
      结果本质随机，历史统计不构成未来保证。未满 18 周岁请勿使用。
    </div>
  );
}
