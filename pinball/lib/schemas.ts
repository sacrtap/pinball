import { z } from 'zod';
import { BASE_BET, HOLE_COUNT, litCountFor } from '@/lib/rules';
import type { Multiplier } from '@/lib/types';

/** 机台 */
export const MachineSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().max(64).optional().nullable(),
  venue: z.string().max(128).optional().nullable(),
  holeCount: z.number().int().min(1).max(64).default(HOLE_COUNT),
  holeNumbering: z.enum(['ltr', 'rtl']).default('ltr'),
});

/** Session 创建 */
export const SessionSchema = z.object({
  machineId: z.string().uuid(),
});

/** 单局录入（字段级校验） */
const RoundFieldsSchema = z.object({
  sessionId: z.string().uuid(),
  machineId: z.string().uuid(),
  multiplier: z.union([z.literal(2), z.literal(4), z.literal(6), z.literal(8), z.literal(10)]),
  litHoles: z.array(z.number().int().min(1).max(HOLE_COUNT)),
  baseBet: z.number().int().min(1),
  extraBet: z.number().int().min(0),
  power: z.enum(['low', 'mid', 'high']),
  landHole: z.number().int().min(1).max(HOLE_COUNT),
  clientRequestId: z.string().min(1).max(128),
  recommendedPower: z.enum(['low', 'mid', 'high']).optional().nullable(),
  recommendMode: z.enum(['thompson', 'prior']).optional().nullable(),
  hit: z.boolean().optional(),
});

/** 跨字段校验：亮灯数=倍率映射、亮灯不重复、投入下限 */
export const RoundInputSchema = RoundFieldsSchema.superRefine((v, ctx) => {
  const expected = litCountFor(v.multiplier as Multiplier);
  if (v.litHoles.length !== expected) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `倍率 ${v.multiplier} 需要 ${expected} 个亮灯通道，收到 ${v.litHoles.length}`,
      path: ['litHoles'],
    });
  }
  if (new Set(v.litHoles).size !== v.litHoles.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '亮灯通道不可重复', path: ['litHoles'] });
  }
  if (v.extraBet + v.baseBet < BASE_BET) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '总投入不得低于基础投入', path: ['extraBet'] });
  }
});

/** 编辑（partial；字段级 schema 上取 partial，跨字段校验在路由内单独执行） */
export const RoundPatchSchema = RoundFieldsSchema.partial().extend({
  roundId: z.string().uuid(),
});

/** 注册 */
export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

/** OTP 验证 */
export const VerifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

export type MachineInput = z.infer<typeof MachineSchema>;
export type SessionInput = z.infer<typeof SessionSchema>;
export type RoundInput = z.infer<typeof RoundInputSchema>;
export type RoundPatch = z.infer<typeof RoundPatchSchema>;
