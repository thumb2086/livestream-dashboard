import { NextResponse } from "next/server";
// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
import {
  listOBSSources, createOBSSource, setOBSSourceEnabled,
  rotateOBSToken, renameOBSSource,
} from "@/lib/obs-http";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";
import { OVERLAYS, newOverlayToken, overlayByKey, overlayUrl } from "@/lib/overlays";

/**
 * Issues and rotates Browser Source tokens for OBS overlays.
 * GET              -> every registered overlay plus its token (missing ones are
 *                     created on first read so the list is always complete).
 * POST _meta=ensure   -> make sure one specific overlay exists, return its token
 * POST _meta=reissue  -> rotate a token (invalidates the old URL)
 * POST _meta=toggle    -> enable/disable an overlay
 */
function originOf(req: Request) {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

async function listAll(userId: string, origin: string) {
  const rows = await listOBSSources(userId);
  const byKey = new Map(rows.map((r) => [r.sourceKey, r]));

  // Create any overlay that has never been issued for this account.
  for (const def of OVERLAYS) {
    if (byKey.has(def.key)) continue;
    const row = await createOBSSource(userId, def.key, def.name, newOverlayToken(), def.defaultEnabled);
    if (!row) {
      // Should not happen — but do not crash if it does.
      continue;
    }
    byKey.set(def.key, row);
  }

  return OVERLAYS.map((def) => {
    const row: any = byKey.get(def.key);
    return {
      key: def.key,
      name: def.name,
      path: def.path,
      hasRoute: def.hasRoute,
      id: row.id,
      token: row.token,
      enabled: row.enabled,
      url: overlayUrl(origin, def.path, row.token),
    };
  });
}

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const sources = await listAll(user.id, originOf(req));
    return NextResponse.json({ sources });
  } catch (e) {
    console.error("GET /api/v1/obs error:", e);
    return NextResponse.json({ error: "Failed to fetch OBS sources" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const body = await req.json();
    const origin = originOf(req);

    if (body._meta === "ensure") {
      const def = overlayByKey(typeof body.key === "string" ? body.key : "");
      if (!def) return NextResponse.json({ error: "Unknown overlay key" }, { status: 400 });
      const sources = await listAll(user.id, origin);
      const mine = sources.find((s) => s.key === def.key);
      return NextResponse.json({ sources, source: mine });
    }

    if (body._meta === "toggle") {
      if (typeof body.id !== "string" || typeof body.enabled !== "boolean") {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      await setOBSSourceEnabled(body.id, user.id, body.enabled);
    } else if (body._meta === "reissue") {
      if (typeof body.id !== "string") {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      await rotateOBSToken(body.id, user.id, newOverlayToken());
    } else if (body._meta === "rename") {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
      if (!name || typeof body.id !== "string") {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      await renameOBSSource(body.id, user.id, name);
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const sources = await listAll(user.id, origin);
    return NextResponse.json({ sources });
  } catch (e) {
    console.error("POST /api/v1/obs error:", e);
    return NextResponse.json({ error: "Failed to update OBS sources" }, { status: 500 });
  }
}