import TopNav from "@/components/TopNav";
import Sidebar from "@/components/Sidebar";
import { ToastProvider } from "@/components/toast/Toast";
import RequireAuth from "@/components/RequireAuth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-livecore-entry="dashboard">
      <RequireAuth>
        <ToastProvider>
          <TopNav />
          <div className="dashboard-shell" style={{
            display: "grid",
            gridTemplateColumns: "264px minmax(0, 1fr)",
            minHeight: "calc(100vh - 59px)",
            background: "var(--ic-canvas)",
          }}>
            <Sidebar />
            <main className="p-6">{children}</main>
          </div>
        </ToastProvider>
      </RequireAuth>
    </div>
  );
}
