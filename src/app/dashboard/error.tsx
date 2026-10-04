"use client";

import { useEffect } from "react";

/**
 * Dashboard-scoped boundary. Every settings page lives under this segment, so
 * one page throwing during render shows this fallback instead of blanking the
 * whole console. Next 16 exposes `unstable_retry`, not `reset`.
 */
export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard-error]", error);
  }, [error]);

  return (
    <div className="security-warning" role="alert" style={{ marginBottom: 18 }}>
      <strong style={{ display: "block", marginBottom: 6 }}>這個設定頁載入失敗</strong>
      <p style={{ margin: "0 0 14px" }}>
        其他頁面仍可正常使用。重試會重新載入這個區段。
        {error.digest ? `（錯誤代碼 ${error.digest}）` : ""}
      </p>
      <div className="action-row">
        <button type="button" className="primary-button" onClick={() => unstable_retry()}>
          重試
        </button>
        <a className="ghost-button" href="/dashboard">
          回控制中心
        </a>
      </div>
    </div>
  );
}