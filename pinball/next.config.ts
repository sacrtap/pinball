import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本仓库位于用户主目录下的嵌套路径，Next.js 会向上探测到主目录的
  // package-lock.json 并误判 workspace root（导致 tracing 范围过大 +
  // 启动警告）。显式固定为项目目录。
  outputFileTracingRoot: import.meta.dirname,
  // E2E 独立构建目录：dev server 常驻时并发写 .next 会产生残缺 chunk
  // （webpack-runtime 'call' of undefined → 页面 500）。设 E2E_BUILD=1
  // 时构建/启动走 .next-e2e，与 dev 的 .next 互不干扰。
  ...(process.env.E2E_BUILD ? { distDir: ".next-e2e" } : {}),
};

export default nextConfig;
