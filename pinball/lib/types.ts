/** 全栈共享类型定义。与 Prisma 生成类型对齐，按需 re-export。 */

export type Multiplier = 2 | 4 | 6 | 8 | 10;

export type PowerLevel = 'low' | 'mid' | 'high';

export type HoleNumbering = 'ltr' | 'rtl';

export type SessionStatus = 'active' | 'closed';

export type MembershipRole = 'owner' | 'member';

export type RecommendMode = 'thompson' | 'prior';

/** 机台 */
export interface Machine {
  id: string;
  tenantId: string;
  code: string;
  name: string | null;
  venue: string | null;
  holeCount: number;
  holeNumbering: string;
  createdAt: Date;
}

/** 对局 Session（冗余统计字段由录入事务维护） */
export interface GameSession {
  id: string;
  tenantId: string;
  machineId: string;
  startedAt: Date;
  endedAt: Date | null;
  status: SessionStatus;
  roundCount: number;
  totalBet: number;
  totalWin: number;
  cards: number;
}

/** 单局录入记录 */
export interface Round {
  id: string;
  tenantId: string;
  sessionId: string;
  seq: number;
  multiplier: number;
  litHoles: number[];
  baseBet: number;
  extraBet: number;
  totalBet: number;
  power: string;
  landHole: number;
  hit: boolean;
  reward: number;
  cardIssued: number;
  recommendedPower: string | null;
  recommendMode: string | null;
  modelVersion: number;
  edited: boolean;
  clientRequestId: string;
  createdAt: Date;
}

/** L1 后验计数 */
export interface Posterior {
  tenantId: string;
  machineId: string;
  power: PowerLevel;
  counts: number[];
}

/** L2 拟合参数 */
export interface SimParams {
  tenantId: string;
  machineId: string;
  power: PowerLevel;
  pegBias: number;
  entryOffset: number;
  spread: number;
  fittedAt: Date;
  sampleN: number;
}

/** L3 Beta 臂 */
export interface BanditArm {
  tenantId: string;
  machineId: string;
  power: PowerLevel;
  alpha: number;
  beta: number;
}

/** L3 推荐结果 */
export interface RecommendResult {
  thompsonPower: PowerLevel;
  argmaxPower: PowerLevel;
  bestArmProb: [number, number, number];
  degraded: boolean;
  expectedReturn: number;
  /** 12 通道后验均值（推荐臂） */
  channelProb: number[];
}

/** L2 模拟结果 */
export interface SimResult {
  dist: number[];
  stderr: number[];
}
