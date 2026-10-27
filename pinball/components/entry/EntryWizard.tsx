'use client';

import { useRouter } from 'next/navigation';
import { useEntryStore, type EntryStep } from '@/lib/stores/entry-store';
import { BASE_BET, LIT_COUNT, SAMPLE_THRESHOLD } from '@/lib/rules';
import { enqueue } from '@/lib/offline/outbox';
import { TouchButton } from '@/components/ui/TouchButton';
import { MultiplierPicker } from './MultiplierPicker';
import { HoleBoard } from './HoleBoard';
import { ExtraBetStepper } from './ExtraBetStepper';
import { PowerPicker } from './PowerPicker';

export interface SessionOverview {
  roundCount: number;
  totalBet: number;
  totalWin: number;
  cards: number;
}

const STEP_TITLES = ['选择倍率', '选择亮灯通道', '加注', '选择发力', '记录落点', '确认提交'];

/**
 * 6 步录入向导。提交后重置开下一局。
 * 单局点按上限：倍率1 + 亮灯N + 加注0.. + 发力1 + 落点1 + 提交1 ≤ 6+（加注可跳过）。
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
  const { step, multiplier, litHoles, extraBet, power, landHole, hit } = store;

  const litMax = multiplier ? LIT_COUNT[multiplier] : 0;
  const canNext =
    (step === 0 && !!multiplier) ||
    (step === 1 && litHoles.length === litMax) ||
    step === 2 ||
    (step === 3 && !!power) ||
    (step === 4 && landHole !== null) ||
    (step === 5 && hit !== null);

  function next() {
    if (step < 5 && canNext) store.setStep((step + 1) as EntryStep);
  }

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
      hit,
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
        {step + 1}/6 {STEP_TITLES[step]}
      </h2>

      {step === 0 && (
        <MultiplierPicker
          value={multiplier}
          onChange={(m) => {
            store.setMultiplier(m);
            store.setStep(1);
          }}
        />
      )}

      {step === 1 && multiplier && (
        <>
          <p className="text-sm text-[var(--muted)]">
            选择 {litMax} 个亮灯通道（已选 {litHoles.length}/{litMax}）
          </p>
          <HoleBoard
            mode="lit"
            value={litHoles}
            onChange={(holes) => {
              const last = holes[holes.length - 1];
              if (last !== undefined && !litHoles.includes(last)) store.toggleLitHole(last, litMax);
              else if (litHoles.length > holes.length) {
                const removed = litHoles.find((h) => !holes.includes(h));
                if (removed !== undefined) store.toggleLitHole(removed, litMax);
              }
            }}
            maxSelect={litMax}
          />
        </>
      )}

      {step === 2 && <ExtraBetStepper value={extraBet} onChange={store.setExtraBet} />}

      {step === 3 && (
        <PowerPicker
          value={power}
          onChange={store.setPower}
          recommended={store.recommendation?.thompsonPower ?? null}
        />
      )}

      {step === 4 && (
        <>
          <p className="text-sm text-[var(--muted)]">选择本局落点</p>
          <HoleBoard mode="land" value={landHole !== null ? [landHole] : []} onChange={(h) => store.setLandHole(h[0])} />
        </>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            落点 {landHole} 号洞，亮灯 {litHoles.join(', ')}。是否命中？
          </p>
          <div className="grid grid-cols-2 gap-2">
            <TouchButton
              variant={hit === true ? 'primary' : 'secondary'}
              onClick={() => store.setHit(true)}
            >
              命中
            </TouchButton>
            <TouchButton
              variant={hit === false ? 'primary' : 'secondary'}
              onClick={() => store.setHit(false)}
            >
              未中
            </TouchButton>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {step > 0 && (
          <TouchButton variant="secondary" onClick={() => store.setStep((step - 1) as EntryStep)}>
            上一步
          </TouchButton>
        )}
        {step < 5 && (
          <TouchButton block onClick={next} disabled={!canNext}>
            下一步
          </TouchButton>
        )}
        {step === 5 && (
          <TouchButton block onClick={submit} disabled={hit === null}>
            提交本局
          </TouchButton>
        )}
      </div>

      {/* 样本门槛提示（M3 满 20 局后由 RecommendSheet 接入） */}
      {overview.roundCount < SAMPLE_THRESHOLD && step === 3 && (
        <p className="text-center text-xs text-[var(--muted)]">
          再录 {SAMPLE_THRESHOLD - overview.roundCount} 局解锁发力推荐
        </p>
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
