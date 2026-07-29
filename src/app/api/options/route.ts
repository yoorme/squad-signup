import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, withErrorHandler } from "@/lib/api";

// 获取所有可选项（能力/职责/干员），供前端表单使用
export const GET = withErrorHandler(async (req: NextRequest) => {
  const searchParams = req.nextUrl.searchParams;
  const only = searchParams.get("only"); // ability | duty | operator | all

  const [abilities, duties, operators] = await Promise.all([
    only && only !== "ability" && only !== "all"
      ? []
      : prisma.ability.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    only && only !== "duty" && only !== "all"
      ? []
      : prisma.duty.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    only && only !== "operator" && only !== "all"
      ? []
      : prisma.operator.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  return ok({ abilities, duties, operators });
});
