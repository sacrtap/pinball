-- 应用连接角色：普通角色，无 BYPASSRLS、非 superuser。
-- RLS 的 FORCE ROW LEVEL SECURITY 对表属主同样生效，因此连接角色既不能是
-- superuser（RLS 被绕过）也不能带 BYPASSRLS 属性。
--
-- 本地开发（无 Docker）由开发者手动执行一次：
--   psql -h 127.0.0.1 -U postgres -d pinball_dev -f prisma/sql/01-app-role.sql
-- Docker 部署时由 postgres 容器 docker-entrypoint-initdb.d 自动执行。

-- 必需扩展（citext 用于邮箱大小写不敏感，pgcrypto 用于 gen_random_uuid）
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pinball_app') THEN
    CREATE ROLE pinball_app LOGIN PASSWORD 'pinball_app_dev';
  END IF;
END
$$;

-- 表级读写权限（迁移建表后执行；此处幂等授权语句对后续新表同样适用，
-- 每次 migrate deploy 后重跑本脚本即可）。
-- 注意：使用 current_database() 而非硬编码库名，兼容 pinball_dev / pinball / pinball_test 等。
GRANT CONNECT ON DATABASE current_database() TO pinball_app;
GRANT USAGE ON SCHEMA public TO pinball_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pinball_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pinball_app;

-- 未来迁移新建的表自动授予（default privileges 对显式 CREATE ROLE 同样生效）
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pinball_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO pinball_app;

-- L4 全局先验聚合角色：需要跨租户读 Posterior / 写 GlobalPrior，
-- 普通角色被 RLS 限制在本租户内，因此单独授予 BYPASSRLS 的聚合角色。
-- 该角色仅供 BullMQ 定时聚合 job 使用，不暴露给任何请求路径。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pinball_agg') THEN
    CREATE ROLE pinball_agg LOGIN PASSWORD 'pinball_agg_dev' BYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE current_database() TO pinball_agg;
GRANT USAGE ON SCHEMA public TO pinball_agg;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pinball_agg;
GRANT INSERT, UPDATE ON "GlobalPrior" TO pinball_agg;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO pinball_agg;
