"use client";

import { useEffect } from "react";

/**
 * Segment-level boundary. The dashboard has its own narrower one, so a crash in
 * a single settings page does not take down the whole app shell.
 * Next 16 exposes `unstable_retry`, not the `reset` used in earlier versions.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div
      style={{
        maxWidth: 560,
        margin: "64px auto",
        padding: "28px 26px",
        border: "1px solid #fecaca",
        borderRadius: 16,
        background: "#fff",
        textAlign: "center",
      }}
    >
      <h2 style={{ margin: "0 0 10px", fontSize: 21, fontWeight: 700, color: "#0f172a" }}>
        這個頁面載入失敗
      </h2>
      <p style={{ margin: "0 0 20px", fontSize: 14, lineHeight: 1.65, color: "#64748b" }}>
        已經重新載入過一次了。重試會再請求一次這個區段的資料。
      </p>

      {error.digest && (
        <p style={{ margin: "0 0 20px", fontSize: 12, fontFamily: "monospace", color: "#94a3b8" }}>
          錯誤代碼：{error.digest}
        </p>
      )}

      <button
        type="button"
        onClick={() => unstable_retry()}
        style={{
          minHeight: 40,
          padding: "0 22px",
          border: "none",
          borderRadius: 10,
          background: "#059669",
          color: "#fff",
          fontSize: 14,
          fontWeight: 650,
          cursor: "pointer",
        }}
      >
        重試
      </button>
    </div>
  );
}