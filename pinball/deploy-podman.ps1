#!/usr/bin/env pwsh
# 「幻想兔」弹珠机预测系统 — Podman 一键部署脚本
# 在 pinball/pinball 目录下运行
# 用法：
#   .\deploy-podman.ps1           # 完整部署（构建 + 启动 + 迁移 + 种子）
#   .\deploy-podman.ps1 -Rebuild  # 强制重新构建镜像
#   .\deploy-podman.ps1 -Down     # 停止并删除容器

param(
  [switch]$Rebuild,
  [switch]$Down,
  [switch]$Restart
)

$ErrorActionPreference = "Stop"
$ComposeFile = "docker-compose.podman.yml"
$EnvFile = ".env.podman"

# 检查 .env.podman 是否存在
if (-not (Test-Path $EnvFile)) {
  if (Test-Path ".env.podman.example") {
    Copy-Item ".env.podman.example" $EnvFile
    Write-Host "已从模板创建 $EnvFile，请编辑后重新运行此脚本。" -ForegroundColor Yellow
    Write-Host "必填项：AUTH_SECRET（运行 [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 })) 生成）" -ForegroundColor Yellow
    exit 1
  } else {
    Write-Host "找不到 $EnvFile 和 .env.podman.example" -ForegroundColor Red
    exit 1
  }
}

# 检查 AUTH_SECRET 是否仍为模板值
$envContent = Get-Content $EnvFile -Raw
if ($envContent -match "AUTH_SECRET=replace-me") {
  Write-Host "请先编辑 $EnvFile 填入真实的 AUTH_SECRET" -ForegroundColor Red
  Write-Host "生成命令: [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))" -ForegroundColor Yellow
  exit 1
}

if ($Down) {
  Write-Host "停止并删除 pinball 容器..." -ForegroundColor Cyan
  podman compose -f $ComposeFile --env-file $EnvFile down
  exit 0
}

if ($Restart) {
  Write-Host "重启 pinball 容器..." -ForegroundColor Cyan
  podman compose -f $ComposeFile --env-file $EnvFile restart
  exit 0
}

# 确保 services-net 外部网络存在
$networkExists = podman network inspect services-net 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "创建外部网络 services-net..." -ForegroundColor Cyan
  podman network create services-net
}

# 构建并启动
$buildFlag = ""
if ($Rebuild) { $buildFlag = "--build" }

Write-Host "启动 pinball 全栈（PostgreSQL + PgBouncer + Redis + App + Worker）..." -ForegroundColor Cyan
podman compose -f $ComposeFile --env-file $EnvFile up -d $buildFlag --build
if ($LASTEXITCODE -ne 0) {
  Write-Host "启动失败" -ForegroundColor Red
  exit 1
}

# 等待 postgres 健康
Write-Host "等待 PostgreSQL 就绪..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

# 执行数据库迁移
Write-Host "执行 Prisma 迁移..." -ForegroundColor Cyan
podman compose -f $ComposeFile --env-file $EnvFile exec app pnpm prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
  Write-Host "迁移失败，可能是 PostgreSQL 尚未完全就绪，稍后重试" -ForegroundColor Yellow
  Start-Sleep -Seconds 5
  podman compose -f $ComposeFile --env-file $EnvFile exec app pnpm prisma migrate deploy
}

# 执行种子数据
Write-Host "执行种子数据..." -ForegroundColor Cyan
podman compose -f $ComposeFile --env-file $EnvFile exec app pnpm prisma db seed

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "部署完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "种子账号:" -ForegroundColor White
Write-Host "  邮箱: dev@pinball.local" -ForegroundColor White
Write-Host "  密码: dev-password-123" -ForegroundColor White
Write-Host ""
Write-Host "下一步: 在 Cloudflare Dashboard 中配置 Tunnel 公网入口" -ForegroundColor Yellow
Write-Host "  1. Zero Trust → Networks → Tunnels → 选中你的 tunnel" -ForegroundColor Yellow
Write-Host "  2. Public Hostnames → Add a public hostname" -ForegroundColor Yellow
Write-Host "  3. Subdomain: pinball" -ForegroundColor Yellow
Write-Host "  4. Domain: jqmro.com" -ForegroundColor Yellow
Write-Host "  5. Service: HTTP → pinball-app:3000" -ForegroundColor Yellow
Write-Host ""
Write-Host "访问地址: https://pinball.jqmro.com" -ForegroundColor Cyan
