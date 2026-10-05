import { prisma } from "@/lib/prisma";

/**
 * Live command evaluation.
 *
 * LiveCommand rows used to have exactly two consumers: the CRUD inside
 * /api/v1/commands. Nothing in the app ever read them, so every command a
 * creator saved was a dead row while the page claimed
 * 「設定觀眾輸入指令時的自動回覆」.
 *
 * This module is the missing consumer. It is called from the single chat
 * ingestion path (/api/v1/chat/messages), which every source funnels through --
 * the chat worker and the YouTube pull both post there.
 */

/** Minimum seconds between two firings of the same trigger, per user. */
const COOLDOWN_SECONDS = 20;

/**
 * On globalThis because this module can be instantiated more than once under
 * Next's dev server, the same reason the SSE hub and the usage meter need it --
 * a module-level Map is not shared across route module instances.
 */
const LAST_FIRED: Map<string, number> =
  (globalThis as any).__liveCommandCooldown ??= new Map<string, number>();

/** Cap so a long message cannot be scanned against an unbounded trigger list. */
const MAX_TRIGGERS = 50;
const MAX_MESSAGE_LEN = 400;

export type CommandMatch = { id: string; trigger: string; response: string };

/**
 * Find the command a chat message triggers, if any.
 *
 * Deterministic on purpose: sortOrder first, then the trigger alphabetically,
 * so two commands sharing a prefix always resolve the same way. A plain find()
 * over an unordered result would let the same message pick different commands
 * between requests.
 *
 * `isResponse` blocks recursion -- a command's own reply must not be able to
 * fire another command.
 */
export async function matchCommand(
  userId: string,
  message: string,
  isResponse = false
): Promise<CommandMatch | null> {
  if (isResponse) return null;
  const text = (message ?? "").trim();
  if (!text || text.length > MAX_MESSAGE_LEN) return null;

  const rows = await (prisma as any).liveCommand.findMany({
    where: { userId, enabled: true },
    orderBy: [{ sortOrder: "asc" }, { trigger: "asc" }],
    take: MAX_TRIGGERS,
    select: { id: true, trigger: true, response: true },
  });

  const lower = text.toLowerCase();
  for (const row of rows) {
    const trigger = (row.trigger ?? "").trim();
    if (!trigger) continue;
    if (!lower.startsWith(trigger.toLowerCase())) continue;

    // A trigger matches whole words only, so `!help` does not fire on `!helper`
    // and `!s` does not fire on `!shrug`.
    const rest = text.slice(trigger.length);
    if (rest.length > 0 && !/^\s/.test(rest)) continue;

    const key = `${userId}:${row.id}`;
    const last = LAST_FIRED.get(key) ?? 0;
    const now = Date.now();
    if (now - last < COOLDOWN_SECONDS * 1000) return null; // in cooldown
    LAST_FIRED.set(key, now);
    return row;
  }
  return null;
}

/**
 * Evaluate a freshly ingested chat message and, on a match, append the reply to
 * the same chat log so every overlay picks it up.
 *
 * Returns the reply when one was sent, otherwise null. Failures are swallowed:
 * a broken command must not drop the viewer's chat message.
 */
export async function runLiveCommand(
  userId: string,
  args: { platform: string; message: string; isOwner?: boolean }
): Promise<{ trigger: string; response: string } | null> {
  try {
    const match = await matchCommand(userId, args.message, args.isOwner === true);
    if (!match || !match.response.trim()) return null;

    await (prisma as any).chatMessage.create({
      data: {
        userId,
        platform: args.platform,
        // Rendered as the creator speaking in the chat overlay.
        userName: "指令",
        message: match.response,
        avatarUrl: "",
        isOwner: true,
      },
    });
    return { trigger: match.trigger, response: match.response };
  } catch (e) {
    console.error("[live-command] failed", e);
    return null;
  }
}

/** Drop cooldowns for a user, e.g. after they edit their command list. */
export function resetCommandCooldown(userId: string): void {
  for (const k of [...LAST_FIRED.keys()]) if (k.startsWith(`${userId}:`)) LAST_FIRED.delete(k);
}