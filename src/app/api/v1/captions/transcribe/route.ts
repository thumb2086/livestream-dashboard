import { NextResponse } from "next/server";
import {
  transcribePcm, pcmRms, looksLikeHallucination, groqConfigured, providerStatus, SAMPLE_RATE,
} from "@/lib/captions-groq";

export const dynamic = "force-dynamic";
// Audio upload + a Whisper round trip; keep well under the platform ceiling.
export const maxDuration = 30;

/**
 * POST raw 16kHz mono Int16 PCM -> transcript.
 *
 * The body is the raw buffer rather than multipart so the upload path stays
 * short; the WAV container is added here. Query params:
 *   startMs   absolute stream position of the first sample
 *   language  ISO-639-1, default zh
 *   model     whisper-large-v3-turbo (default) | whisper-large-v3
 *   minRms    skip silent windows, default 0.006
 *
 * Overlapping windows deliberately re-transcribe the same audio; the caller
 * joins the fragments with `mergeCaption` (src/lib/caption-merge.ts). Groq only
 * returns segment-level timestamps, so de-duplicating on time would drop text.
 */
export async function POST(req: Request) {
  if (!groqConfigured()) {
    return NextResponse.json(
      { error: "Groq 未設定，請設定 GROQ_API_KEY（直連）或 GROQ_ROUTER_URL + GROQ_ROUTER_KEY" },
      { status: 503 }
    );
  }

  const q = new URL(req.url).searchParams;
  const startMs = Number(q.get("startMs") ?? 0) || 0;
  const language = q.get("language") || "zh";
  const model = (q.get("model") || "whisper-large-v3-turbo") as
    | "whisper-large-v3-turbo"
    | "whisper-large-v3";
  const minRms = Number(q.get("minRms") ?? 0.006) || 0;

  let pcm: Buffer;
  try {
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length < 2048) {
      return NextResponse.json({ error: "音訊片段太短" }, { status: 400 });
    }
    pcm = buf;
  } catch {
    return NextResponse.json({ error: "無法解析音訊" }, { status: 400 });
  }

  const windowMs = Math.round((pcm.length / 2 / SAMPLE_RATE) * 1000);

  // Cheap gate: don't spend a request (and latency) on near-silence.
  const rms = pcmRms(pcm);
  if (rms < minRms) {
    return NextResponse.json({ skipped: true, reason: "silence", windowMs, rms });
  }

  try {
    const r = await transcribePcm(pcm, { model, language });

    // Re-base segment timestamps onto the absolute stream timeline. Segments
    // that only cover already-shown audio still come back — windows overlap on
    // purpose — so the caller merges the text, it does not filter on time.
    const kept = r.segments
      .map((s) => ({
        startMs: Math.round(startMs + s.start * 1000),
        endMs: Math.round(startMs + s.end * 1000),
        text: s.text,
      }))
      .filter((s) => !looksLikeHallucination(s.text, 0));

    return NextResponse.json({
      ok: true,
      windowMs,
      rms,
      latencyMs: r.latencyMs,
      provider: r.provider,
      attempts: r.attempts,
      ...(r.fellBackFrom ? { fellBackFrom: r.fellBackFrom, failReason: r.failReason } : {}),
      durationSec: r.durationSec,
      text: kept.map((s) => s.text).join(""),
      segments: kept,
    });
  } catch (e: any) {
    console.error("POST /api/v1/captions/transcribe error:", e);
    return NextResponse.json({ error: e?.message || "轉寫失敗" }, { status: 502 });
  }
}

/** Lets the client show which provider is live before starting. */
export async function GET() {
  const s = providerStatus();
  return NextResponse.json({
    configured: s.order.length > 0,
    provider: s.primary,
    order: s.order,
    direct: s.direct,
    router: s.router,
    routerHost: process.env.GROQ_ROUTER_URL ? new URL(process.env.GROQ_ROUTER_URL).host : null,
    sampleRate: SAMPLE_RATE,
    models: ["whisper-large-v3-turbo", "whisper-large-v3"],
  });
}