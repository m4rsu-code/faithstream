import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthProvider';
import Sidebar from './Sidebar';
import { requestApi } from '../utils/api';
import type { DeletionRequestCountResponse, LicensePaymentCountResponse } from '../utils/types';

export interface AdminLayoutOutletContext {
  refreshKey: number;
  setRefreshing: Dispatch<SetStateAction<boolean>>;
}

const pageTitles: Record<string, string> = {
  '/overview': 'Overview',
  '/users': 'Users',
  '/licenses': 'Licenses',
  '/subscriptions': 'Licenses',
};

export default function AdminLayout() {
  const { user, logout } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [deletionRequestCount, setDeletionRequestCount] = useState(0);
  const [pendingLicensePaymentCount, setPendingLicensePaymentCount] = useState(0);

  useEffect(() => {
    let active = true;
    const refreshDeletionCount = async () => {
      try {
        const [deletionResult, paymentResult] = await Promise.allSettled([
          requestApi<DeletionRequestCountResponse>('/admin/deletion-requests/count'),
          requestApi<LicensePaymentCountResponse>('/admin/license-payments/count'),
        ]);
        if (active) {
          if (deletionResult.status === 'fulfilled') setDeletionRequestCount(deletionResult.value.pending_count);
          if (paymentResult.status === 'fulfilled') setPendingLicensePaymentCount(paymentResult.value.pending_count);
        }
      } catch {
        // Keep the last known badge count if the API is temporarily unavailable.
      }
    };
    void refreshDeletionCount();
    const timer = window.setInterval(() => void refreshDeletionCount(), 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshKey]);

  async function handleLogout(): Promise<void> {
    try {
      await logout();
    } catch {
      // The local session is cleared even if the API is unavailable.
    }
    navigate('/login', { replace: true });
  }

  const outletContext: AdminLayoutOutletContext = { refreshKey, setRefreshing };

  if (!user) {
    return null;
  }

  return (
    <div className="app-shell min-h-screen grid">
      <Sidebar user={user} onLogout={() => void handleLogout()} deletionRequestCount={deletionRequestCount} pendingLicensePaymentCount={pendingLicensePaymentCount} />
      <main className="main-content min-w-0">
        <header className="topbar">
          <div className="breadcrumbs"><span>FaithStream Studio</span><span className="crumb-slash">/</span><strong>{pageTitles[location.pathname] || 'Overview'}</strong></div>
          <div className="topbar-right">
            <span className="secure-chip"><span /> Private workspace</span>
            <button className="refresh-button" type="button" onClick={() => setRefreshKey((key) => key + 1)} disabled={refreshing}>
              <span className={refreshing ? 'spin' : ''} aria-hidden="true">↻</span> Refresh
            </button>
          </div>
        </header>
        <Outlet context={outletContext} />
      </main>
    </div>
  );
}
