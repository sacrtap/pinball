/** 统计页加载骨架：force-dynamic 全量查库期间展示，避免白屏 */
export default function StatsLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5 space-y-4" aria-busy="true">
      <h1 className="text-lg font-bold">复盘统计</h1>
      <p className="text-xs text-[var(--fg)]">
        结果本质随机，历史统计不构成未来保证。未满 18 周岁请勿使用。
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-[var(--border)] p-2">
            <div className="h-3 w-10 animate-pulse rounded bg-[var(--border)]" />
            <div className="mt-2 h-5 w-14 animate-pulse rounded bg-[var(--border)]" />
          </div>
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-[var(--border)] p-3">
          <div className="h-3 w-20 animate-pulse rounded bg-[var(--border)]" />
          <div className="mt-3 h-40 w-full animate-pulse rounded bg-[var(--border)]" />
        </div>
      ))}
    </main>
  );
}
