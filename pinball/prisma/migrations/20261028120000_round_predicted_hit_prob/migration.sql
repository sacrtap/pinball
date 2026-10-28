-- 预测链路修复：Round 增加录入时点的预测命中概率（校准曲线输入）。
-- 纯加列，向后兼容；历史局为 NULL，calibration() 走 globalRate 兜底。
ALTER TABLE "Round" ADD COLUMN "predictedHitProb" DOUBLE PRECISION;
