import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { Zap, Database } from "lucide-react";
import { DashboardPage } from "./pages/DashboardPage";
import { JobPage } from "./pages/JobPage";
import { MasterItemsPage } from "./pages/MasterItemsPage";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-primary text-white shadow-md">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg tracking-tight hover:opacity-90">
            <Zap size={20} />
            Electrical Symbol Inspector OS
          </Link>
          <nav className="flex gap-4">
            <Link to="/master-items" className="flex items-center gap-1 text-sm text-white/80 hover:text-white transition-colors">
              <Database size={15} />
              単価マスター
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="text-center text-xs text-gray-400 py-3 border-t">
        Electrical Symbol Inspector OS v1.0
      </footer>
    </div>
  );
}

export default function App() {
  const basename = import.meta.env.PROD ? "/electrical-symbol-inspector" : "/";
  return (
    <BrowserRouter basename={basename}>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/jobs/:jobId" element={<JobPage />} />
          <Route path="/master-items" element={<MasterItemsPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
