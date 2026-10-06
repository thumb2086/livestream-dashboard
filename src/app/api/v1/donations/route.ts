import { NextResponse } from "next/server";
// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
// Prisma 7 的 query compiler 是 WASM，而 Workers 拒絕動態 WASM codegen。
//
// ⚠️ 這條路由有 11 處 Prisma，而且它是「創作者設定斗內」的實際功能。
//   壞掉的症狀是 GET 回 500、前端顯示「載入失敗」——
//   而那看起來像網路問題，不是資料庫問題。
import {
  listGoals, countGoals, createGoal, deleteGoal, updateGoal,
  updateDonationSettings, createTestDonation, advanceGoal,
  donationSettings, num,
} from "@/lib/donations-http";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const goals = await listGoals(user.id);
    return NextResponse.json({
      goals, minAmount: user.donationMinAmount, soundEffect: user.donationSound,
      totalReceived: user.donationTotal, donorCount: user.donationDonors,
    });
  } catch (e) {
    console.error("GET /api/v1/donations error:", e);
    return NextResponse.json({ error: "Failed to fetch donations" }, { status: 500 });
  }
}

async function refresh(userId: string) {
  // ⚠️ 原本是 findUnique + 強制斷言（!）—— 查不到就 undefined，! 只是騙過
    // 型別，然後在下一行讀 user.donationMinAmount 時炸成 TypeError。
    // 現在回 null 並明確回 401/404。
    const user = await donationSettings(userId);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const goals = await listGoals(userId);
  return NextResponse.json({
    goals, minAmount: user.donationMinAmount, soundEffect: user.donationSound,
    totalReceived: user.donationTotal, donorCount: user.donationDonors,
  });
}

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const body = await req.json();

    if (body._meta === "updateUser") {
      // Totals are server-computed via simulate/confirmed donations only.
      // Accepting totalReceived/donorCount from client allows stats forgery.
      //
      // ⚠️ 這裡**只**更新設定，不碰 totalReceived / donorCount ——
      //    那正是上面註解在防的偽造途徑。改寫時要盯住這點。
      await updateDonationSettings(user.id, {
        donationMinAmount: body.minAmount ?? user.donationMinAmount,
        donationSound: body.soundEffect ?? user.donationSound,
      });
      return refresh(user.id);
    }

    if (body._meta === "addGoal") {
      if (!body.title || typeof body.title !== "string" || !body.title.trim() || typeof body.goal !== "number" || body.goal <= 0) {
        return NextResponse.json({ error: "Invalid goal data" }, { status: 400 });
      }
      // ⚠️ sortOrder = 現有目標數量 —— 所以「刪掉中間一個」之後，
      //    新增的目標會拿到與別人重複的 sortOrder。
      //    那不是我改壞的，是**繼承**的行為；ORDER BY 在相同 sortOrder
      //    時順序未定義。記錄下來是為了讓後續有人知道那不是疏漏。
      const count = await countGoals(user.id);
      await createGoal(user.id, {
        title: body.title.trim(),
        emoji: body.emoji || "🎯",
        goal: body.goal,
        sortOrder: count,
      });
      return refresh(user.id);
    }

    if (body._meta === "deleteGoal") {
      if (!body.id) return NextResponse.json({ error: "Missing goal id" }, { status: 400 });
      // ⚠️ where 裡的 userId 是**所有權檢查** —— 絕不能只帶 id。
      //   而回傳值（是否真的刪到）原始碼沒有檢查：
      //   「刪掉不存在的目標」與「刪掉別人的目標」外觀完全相同。
      await deleteGoal(body.id, user.id);
      return refresh(user.id);
    }

    if (body._meta === "updateGoal") {
      if (!body.id) return NextResponse.json({ error: "Missing goal id" }, { status: 400 });
      await updateGoal(body.id, user.id, {
        title: body.title,
        goal: body.goal,
        emoji: body.emoji,
        current: body.current,
      });
      return refresh(user.id);
    }

    if (body._meta === "simulate") {
      const amount = Math.max(1, Math.floor(Number(body.amount)) || 0);
      if (amount <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

      // Opt-in. This used to increment User.donationTotal / donationDonors --
      // the lifetime figures the public page renders as real money received --
      // so clicking a test button permanently inflated a visible financial
      // total. demoMode is the creator explicitly opting in to test rows.
      if (!user.demoMode) {
        return NextResponse.json(
          { error: "\u6a21\u64ec\u6597\u5165\u9700\u8981\u5148\u958b\u555f\u300c\u5c55\u793a\u6a21\u5f0f\u300d\uff0c\u5426\u5247\u6e2c\u8a66\u6703\u5beb\u5165\u516c\u958b\u9801\u986f\u793a\u7684\u6b63\u5f0f\u7d71\u8a08" },
          { status: 403 }
        );
      }

      // Feed the overlays, which read zixiDonation, rather than the money
      // counters. txHash "TEST" marks the row so it can be identified and
      // removed from the donation ledger.
      await createTestDonation(user.id, amount);

      // The goal bar is the thing under test, so it still advances -- bounded by
      // the goal, so it can complete it but never overshoot.
      //
      // ⚠️ current / goal 在 schema 是 **Int**，而 amount 是數字。
      //    這裡的 Math.min(...) 回傳整數 —— 與 DB 的 Int 一致。
      //    若哪天上改成 Float，Neon 會回字串，
      //    而 Math.min(string, number) 會得到 NaN，且**不會報錯**。
      const goals = await listGoals(user.id);
      const incompleteGoal = goals.find((g) => g.current < g.goal);
      if (incompleteGoal) {
        await advanceGoal(incompleteGoal.id, incompleteGoal.current + amount, incompleteGoal.goal);
      }
      return refresh(user.id);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("POST /api/v1/donations error:", e);
    return NextResponse.json({ error: "Failed to process donations" }, { status: 500 });
  }
}
