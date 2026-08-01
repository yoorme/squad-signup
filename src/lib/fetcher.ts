// SWR 通用 fetcher：解包 { ok, data } 响应格式，失败时抛出带 status 的错误
export async function fetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    const err = new Error(body?.error || "请求失败") as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body.data as T;
}
