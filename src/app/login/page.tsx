import { Suspense } from "react";
import { LoginForm } from "./LoginForm";
import { getSiteSettings } from "@/lib/site-settings";

// 登录页（服务端组件）：读取战队前缀传给客户端表单
// 初始管理员由部署脚本在终端创建（install.sh / deploy.sh / npm run create-admin），
// 网站只负责正常登录
export default async function LoginPage() {
  const { teamPrefix, iconUpdatedAt } = await getSiteSettings();

  return (
    <Suspense fallback={null}>
      <LoginForm
        teamPrefix={teamPrefix}
        iconVersion={iconUpdatedAt?.getTime() ?? 0}
      />
    </Suspense>
  );
}
