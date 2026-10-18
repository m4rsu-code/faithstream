import { Outlet } from 'react-router-dom';
import Header from './Header';
import SidebarNav from './SidebarNav';
import StatusFooter from './StatusFooter';
import AuthGate from './AuthGate';

export default function Layout() {
  return (
    <AuthGate>
      <div className="flex h-screen flex-col bg-navy">
        <Header />
        <div className="flex min-h-0 flex-1">
          <SidebarNav />
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden p-4">
            <Outlet />
          </main>
        </div>
        <StatusFooter message="Ready. Your stream is live on Facebook." />
      </div>
    </AuthGate>
  );
}
