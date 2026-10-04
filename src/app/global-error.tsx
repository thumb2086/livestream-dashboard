"use client";

/**
 * Last-resort boundary. This REPLACES the root layout, so the `<head>` with the
 * stylesheet links is gone too -- the fallback must carry its own styling or it
 * renders as unstyled HTML. Next 16 passes `unstable_retry` here (not `reset`).
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="zh-TW">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#f6f8fb",
          color: "#0f172a",
          fontFamily:
            "Inter, 'Noto Sans TC', system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <div
            style={{
              width: 52,
              height: 52,
              margin: "0 auto 18px",
              display: "grid",
              placeItems: "center",
              borderRadius: 14,
              background: "#fee2e2",
              color: "#b91c1c",
              fontSize: 26,
              fontWeight: 700,
            }}
            aria-hidden
          >
            !
          </div>

          <h1 style={{ margin: "0 0 10px", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>
            頁面出了問題
          </h1>
          <p style={{ margin: "0 0 22px", fontSize: 15, lineHeight: 1.65, color: "#475569" }}>
            整個應用都無法載入。這通常是開發階段的程式錯誤，不是你的資料損毀。
          </p>

          {error.digest && (
            <p style={{ margin: "0 0 22px", fontSize: 12, fontFamily: "monospace", color: "#94a3b8" }}>
              錯誤代碼：{error.digest}
            </p>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                minHeight: 40,
                padding: "0 20px",
                border: "none",
                borderRadius: 10,
                background: "#059669",
                color: "#fff",
                fontSize: 14,
                fontWeight: 650,
                cursor: "pointer",
              }}
            >
              重新載入
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/dashboard";
              }}
              style={{
                minHeight: 40,
                padding: "0 20px",
                border: "1px solid #cbd5e1",
                borderRadius: 10,
                background: "#fff",
                color: "#0f172a",
                fontSize: 14,
                fontWeight: 650,
                cursor: "pointer",
              }}
            >
              回控制中心
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}