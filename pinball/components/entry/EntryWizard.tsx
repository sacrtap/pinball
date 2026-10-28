'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useEntryStore, type EntryStep } from '@/lib/stores/entry-store';
import { BASE_BET, LIT_COUNT, SAMPLE_THRESHOLD, computeReward, isHit } from '@/lib/rules';
import { enqueue } from '@/lib/offline/outbox';
import { TouchButton } from '@/components/ui/TouchButton';
import { MultiplierPicker } from './MultiplierPicker';
import { HoleBoard } from './HoleBoard';
import { ExtraBetStepper } from './ExtraBetStepper';
import { PowerPicker } from './PowerPicker';
import { RecommendCard, type Recommendation } from './RecommendCard';

export interface SessionOverview {
  roundCount: number;
  totalBet: number;
  totalWin: number;
  cards: number;
}

const STEP_TITLES = ['倍率与亮灯', '发力与加注', '落点与提交'];

/**
 * 3 步录入向导。step0 倍率+亮灯选满后点「确定」前进；step1 发力选完即前进；
 * 落点选定后同屏展示 isHit/computeReward 判定结果供核对，再提交。提交后软重置开下一局。
 */
export function EntryWizard({
  sessionId,
  machineId,
  overview,
}: {
  sessionId: string;
  machineId: string;
  overview: SessionOverview;
}) {
  const store = useEntryStore();
  const router = useRouter();
  const recData: Recommendation | null = store.recommendation
    ? {
        mode: store.recommendation.degraded ? 'prior' : 'thompson',
        degraded: store.recommendation.degraded,
        thompsonPower: store.recommendation.thompsonPower,
        argmaxPower: store.recommendation.argmaxPower,
        bestArmProb: store.recommendation.bestArmProb,
        channelProb: store.recommendation.channelProb,
        litHitProb: store.recommendation.litHitProb,
      }
    : null;
  const { step, multiplier, litHoles, extraBet, power, landHole } = store;

  const litMax = multiplier ? LIT_COUNT[multiplier] : 0;

  // 亮灯选满 → 预拉发力推荐（≥20 局才有 Thompson；失败静默降级）。
  // 只预取不前进：前进由 step0「确定」按钮显式触发——自动前进曾让「上一步」被本 effect 立即弹回。
  useEffect(() => {
    if (step !== 0 || !multiplier || litHoles.length !== litMax) return;
    if (store.recommendation) return;
    void fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineId, multiplier, litHoles }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.thompsonPower) store.setRecommendation(d);
      })
      .catch(() => {});
  }, [step, multiplier, litHoles, litMax, machineId, store]);

  async function submit() {
    const clientRequestId = crypto.randomUUID();
    const payload = {
      sessionId,
      machineId,
      multiplier,
      litHoles,
      baseBet: BASE_BET,
      extraBet,
      power,
      landHole,
      clientRequestId,
    };

    // 在线优先直传；断网/失败 → 入 outbox 暂存，恢复后幂等重放
    if (navigator.onLine) {
      try {
        const res = await fetch('/api/rounds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          store.reset();
          router.refresh();
          return;
        }
      } catch {
        // 落到 outbox
      }
    }
    enqueue(payload);
    store.reset();
  }

  return (
    <div className="space-y-4">
      {/* 顶部常驻累计 */}
      <div className="grid grid-cols-4 gap-2 rounded-xl border border-[var(--border)] p-2 text-center text-xs">
        <Stat label="局数" value={overview.roundCount} />
        <Stat label="投入" value={overview.totalBet} />
        <Stat label="中奖" value={overview.totalWin} />
        <Stat label="净盈亏" value={overview.totalWin - overview.totalBet} accent />
      </div>

      {/* 步骤指示 */}
      <div className="flex items-center gap-1">
        {STEP_TITLES.map((t, i) => (
          <div key={t} className="flex-1">
            <div
              className={`h-1 rounded-full ${i <= step ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}
            />
            <p className={`mt-1 text-[10px] ${i === step ? 'text-[var(--fg)]' : 'text-[var(--muted)]'}`}>
              {t}
            </p>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-bold">
        {step + 1}/3 {STEP_TITLES[step]}
      </h2>

      {step === 0 && (
        <>
          <MultiplierPicker value={multiplier} onChange={store.setMultiplier} />
          {multiplier && (
            <>
              <p className="text-sm text-[var(--muted)]">
                选择 {litMax} 个亮灯通道（已选 {litHoles.length}/{litMax}）
                {litHoles.length === litMax && ' · 已选满，取消已选可更换'}
              </p>
              <HoleBoard
                mode="lit"
                value={litHoles}
                onChange={(hole) => store.toggleLitHole(hole, litMax)}
                maxSelect={litMax}
              />
            </>
          )}
        </>
      )}

      {step === 1 && (
        <>
          {/* 推荐卡置顶：样本不足时该位置为占位提示 */}
          {overview.roundCount < SAMPLE_THRESHOLD ? (
            <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--muted)]">
              再录 {SAMPLE_THRESHOLD - overview.roundCount} 局解锁发力推荐
            </p>
          ) : recData ? (
            <RecommendCard
              data={recData}
              litHoles={litHoles}
              totalBet={BASE_BET + extraBet}
              multiplier={multiplier ?? 1}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--muted)]">
              推荐加载中…
            </p>
          )}

          <ExtraBetStepper value={extraBet} onChange={store.setExtraBet} />

          <PowerPicker
            value={power}
            onChange={(p) => {
              store.setPower(p);
              store.setStep(2);
            }}
            recommended={store.recommendation?.thompsonPower ?? null}
          />
        </>
      )}

      {step === 2 && (
        <>
          {landHole === null ? (
            <>
              <p className="text-sm text-[var(--muted)]">选择本局落点</p>
              <HoleBoard mode="land" value={[]} onChange={store.setLandHole} />
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-[var(--border)] p-4 text-center">
                <div
                  className={`text-3xl font-bold ${
                    isHit(landHole, litHoles) ? 'text-[var(--success)]' : 'text-[var(--muted)]'
                  }`}
                >
                  {isHit(landHole, litHoles) ? '命中' : '未中'}
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  本局投入 {BASE_BET + extraBet} 珠 ·{' '}
                  {isHit(landHole, litHoles)
                    ? `奖励 ${computeReward(BASE_BET + extraBet, multiplier!, true)} 珠`
                    : '无奖励'}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  落点 {landHole} 号 · 亮灯 {litHoles.join(', ')}
                </p>
              </div>
              <div className="flex gap-2">
                <TouchButton variant="secondary" onClick={() => store.setLandHole(null)}>
                  重选落点
                </TouchButton>
                <TouchButton block onClick={submit}>
                  提交本局
                </TouchButton>
              </div>
            </div>
          )}
        </>
      )}

      {step === 0 && (
        <TouchButton
          block
          onClick={() => store.setStep(1)}
          disabled={!multiplier || litHoles.length !== litMax}
        >
          确定
        </TouchButton>
      )}
      {step > 0 && (
        <TouchButton variant="secondary" block onClick={() => store.setStep((step - 1) as EntryStep)}>
          上一步
        </TouchButton>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-[var(--muted)]">{label}</div>
      <div className={`font-bold ${accent ? (value >= 0 ? 'text-[var(--success)]' : 'text-[var(--error)]') : ''}`}>
        {value}
      </div>
    </div>
  );
}
