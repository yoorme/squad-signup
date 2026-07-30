import { redirect } from "next/navigation";

// 根路径重定向到赛事页
// （未登录时 /events 的 layout 会再重定向到 /login）
export default function Home() {
  redirect("/events");
}
