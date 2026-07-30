import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["remote-agent.svc.cluster.local", "*.remote-agent.svc.cluster.local"],
  // 生产构建优化
  poweredByHeader: false,
  compress: true,
  // 静态页面长缓存（带 hash 的资源由 Next 自动处理）
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
