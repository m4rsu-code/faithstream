import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthProvider';
import AdminLayout from './components/AdminLayout';
import RequireAdmin from './components/RequireAdmin';
import LoginPage from './routes/login';
import OverviewPage from './routes/overview';
import LicensesPage from './routes/licenses';
import UsersPage from './routes/user';
import '../styles.css';
import '../brand.css';

function DefaultRoute() {
  const { isAuthenticated } = useAdminAuth();
  return <Navigate to={isAuthenticated ? '/overview' : '/login'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAdmin />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="licenses" element={<LicensesPage />} />
          <Route path="subscriptions" element={<Navigate to="/licenses" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<DefaultRoute />} />
    </Routes>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find the app root element.');
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AdminAuthProvider>
        <AppRoutes />
      </AdminAuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
