import { Suspense } from "react";
import { LoginForm } from "./LoginForm";
import { SetupForm } from "./SetupForm";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site-settings";

// 登录页（服务端组件）：读取战队前缀传给客户端表单
// 系统中还没有任何用户（首次部署）时，展示「系统初始化」表单创建初始管理员
export default async function LoginPage() {
  const [{ teamPrefix }, userCount] = await Promise.all([
    getSiteSettings(),
    // 数据库不可达时按「已有用户」处理，避免误显示初始化表单
    prisma.user.count().catch(() => 1),
  ]);

  if (userCount === 0) {
    return <SetupForm teamPrefix={teamPrefix} />;
  }

  return (
    <Suspense fallback={null}>
      <LoginForm teamPrefix={teamPrefix} />
    </Suspense>
  );
}
