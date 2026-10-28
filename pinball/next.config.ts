import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本仓库位于用户主目录下的嵌套路径，Next.js 会向上探测到主目录的
  // package-lock.json 并误判 workspace root（导致 tracing 范围过大 +
  // 启动警告）。显式固定为项目目录。
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
