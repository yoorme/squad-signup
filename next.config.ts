import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["remote-agent.svc.cluster.local", "*.remote-agent.svc.cluster.local"],
};

export default nextConfig;
