import { PrismaClient } from "../generated/prisma/index.js";
import { PrismaNeon } from "@prisma/adapter-neon";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createClient() {
  // ⚠️ 2026-10-06：原本是
  //     if (DATABASE_URL) { …adapter… } else { return new PrismaClient(); }
  //
  //    那個 `new PrismaClient()` 沒有 adapter → 走 Prisma 的**原生引擎**，
  //    而原生引擎在 Cloudflare Workers 上不可用（沒有 Node 的 TCP socket
  //    與原生 .so 載入環境）。
  //
  //    而它**不會立刻報錯** —— 只會在某個查詢時才炸。
  //    在 Vercel 上沒人碰到，因為那條路徑只在 DATABASE_URL 缺席時才走；
  //    而本機開發一定有 DATABASE_URL。
  //    也就是說：**這條分支只在「部署漏設環境變數」時才會被執行** ——
  //    也就是最需要它清楚失敗的時刻。
  //
  //    這與今晚反覆出現的形狀相同：
  //    「看起來正常的環境相依失效」，症狀出現在下游而非源頭。
  //
  //    改成明確失敗。錯的設定要立刻且清楚地壞掉。
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL 未設定 —— 不再退回無 adapter 的 PrismaClient，" +
      "因為那條路徑在 Cloudflare Workers 上不可用（原生引擎需要 TCP socket）。" +
      "這是有意的 fail-loud：寧可在啟動時錯，也不要在第一個查詢時才錯。",
    );
  }
  const adapter = new PrismaNeon({ connectionString: url } as any);
  return new PrismaClient({ adapter } as any);
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
