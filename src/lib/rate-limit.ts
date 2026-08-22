// 轻量内存滑动窗口限流（单进程内生效）
// 适用于 standalone 单实例部署；多实例/Serverless 场景需换成 Redis 等共享存储

type Bucket = {
  timestamps: number[];
};

const buckets = new Map<string, Bucket>();

// 定期清理过期 bucket，避免内存缓慢增长（每 10 分钟）
const CLEANUP_INTERVAL = 10 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
    if (bucket.timestamps.length === 0) buckets.delete(key);
  }
}

export type RateLimitResult =
  | { success: true }
  | { success: false; retryAfterSeconds: number };

/**
 * 滑动窗口限流
 * @param key 限流维度（如 `login:1.2.3.4`）
 * @param limit 窗口内最大请求数
 * @param windowMs 窗口时长（毫秒）
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  cleanup(windowMs);
  const now = Date.now();
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0];
    const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
    buckets.set(key, bucket);
    return { success: false, retryAfterSeconds };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return { success: true };
}

// 从请求中提取客户端 IP。
// 只有 TRUST_PROXY=true 时才信任 X-Forwarded-For，否则使用 x-real-ip 兜底，
// 防止客户端伪造 X-Forwarded-For 绕过限流。
const TRUST_PROXY = process.env.TRUST_PROXY === "true";

export function clientIp(req: Request): string {
  if (TRUST_PROXY) {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}
