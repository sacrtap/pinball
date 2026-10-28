-- ============================================================
-- RLS 行级安全（手写追加，版本化）
-- 双层租户隔离：应用层 withTenant 设置 app.current_tenant，
-- 数据库层 policy 强制 tenantId = current_setting(...)。
-- 连接角色 pinball_app 非 superuser、无 BYPASSRLS，RLS 生效。
-- GlobalPrior/Membership/Tenant/User/OtpCode/Account/AuthSession/
-- VerificationToken/Invitation 不含 tenantId，不加 RLS（全局表/支撑表）。
-- ============================================================

-- Machine
ALTER TABLE "Machine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Machine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Machine"
  USING ("tenantId" = current_setting('app.current_tenant')::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant')::uuid);
CREATE INDEX IF NOT EXISTS "idx_Machine_tenant" ON "Machine"("tenantId");

-- Session
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Session"
  USING ("tenantId" = current_setting('app.current_tenant')::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant')::uuid);
CREATE INDEX IF NOT EXISTS "idx_Session_tenant" ON "Session"("tenantId");

-- Round
ALTER TABLE "Round" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Round" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Round"
  USING ("tenantId" = current_setting('app.current_tenant')::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant')::uuid);
CREATE INDEX IF NOT EXISTS "idx_Round_tenant" ON "Round"("tenantId");

-- Posterior
ALTER TABLE "Posterior" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Posterior" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Posterior"
  USING ("tenantId" = current_setting('app.current_tenant')::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant')::uuid);
CREATE INDEX IF NOT EXISTS "idx_Posterior_tenant" ON "Posterior"("tenantId");

-- SimParams
ALTER TABLE "SimParams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SimParams" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SimParams"
  USING ("tenantId" = current_setting('app.current_tenant')::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant')::uuid);
CREATE INDEX IF NOT EXISTS "idx_SimParams_tenant" ON "SimParams"("tenantId");

-- BanditArm
ALTER TABLE "BanditArm" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BanditArm" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BanditArm"
  USING ("tenantId" = current_setting('app.current_tenant')::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant')::uuid);
CREATE INDEX IF NOT EXISTS "idx_BanditArm_tenant" ON "BanditArm"("tenantId");

-- McSimCache
ALTER TABLE "McSimCache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "McSimCache" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "McSimCache"
  USING ("tenantId" = current_setting('app.current_tenant')::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant')::uuid);
CREATE INDEX IF NOT EXISTS "idx_McSimCache_tenant" ON "McSimCache"("tenantId");

-- AuditLog
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLog"
  USING ("tenantId" = current_setting('app.current_tenant')::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant')::uuid);
CREATE INDEX IF NOT EXISTS "idx_AuditLog_tenant" ON "AuditLog"("tenantId");
