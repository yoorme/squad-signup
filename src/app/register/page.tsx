import { RegisterForm } from "./RegisterForm";
import { getSiteSettings } from "@/lib/site-settings";

// 注册页（服务端组件）：读取战队前缀传给客户端表单
export default async function RegisterPage() {
  const { teamPrefix } = await getSiteSettings();
  return <RegisterForm teamPrefix={teamPrefix} />;
}
