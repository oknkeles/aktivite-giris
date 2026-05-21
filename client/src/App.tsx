import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth, isAdmin } from './store/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Timesheet from './pages/Timesheet';
import Entries from './pages/Entries';
import Activities from './pages/Activities';
import Contractors from './pages/Contractors';
import Customers from './pages/Customers';
import Reports from './pages/Reports';
import Users from './pages/Users';
import AuditLog from './pages/AuditLog';

const qc = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 30_000 } },
});

function Protected({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-ink-3">Yükleniyor...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin(user)) return <Navigate to="/timesheet" replace />;
  return <>{children}</>;
}

export default function App() {
  const init = useAuth((s) => s.initFromStorage);
  useEffect(() => { init(); }, [init]);

  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route path="/" element={<Navigate to="/timesheet" replace />} />
            <Route path="/timesheet" element={<Timesheet />} />
            <Route path="/entries" element={<Entries />} />
            <Route path="/activities" element={<Activities />} />
            <Route path="/contractors" element={<Contractors />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/reports" element={<Protected adminOnly><Reports /></Protected>} />
            <Route path="/users" element={<Protected adminOnly><Users /></Protected>} />
            <Route path="/audit" element={<Protected adminOnly><AuditLog /></Protected>} />
          </Route>
          <Route path="*" element={<Navigate to="/timesheet" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
