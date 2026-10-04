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
          <main className="dashboard-shell">
            <aside className="dashboard-sidebar">
              <Sidebar />
            </aside>
            <section className="dashboard-main">{children}</section>
          </main>
        </ToastProvider>
      </RequireAuth>
    </div>
  );
}