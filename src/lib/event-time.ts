// 把 datetime-local 输入（"YYYY-MM-DDTHH:mm"）按北京时间解析为 UTC Date。
// 服务器运行在 UTC 时区时，也能正确保存用户选择的北京时间。
export function parseEventTimeLocal(input: string): Date {
  const value = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)
    ? `${input}:00+08:00`
    : input;
  return new Date(value);
}
