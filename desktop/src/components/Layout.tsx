import { Outlet } from 'react-router-dom';
import Header from './Header';
import SidebarNav from './SidebarNav';

export default function Layout() {
  return (
    <div className="flex h-screen flex-col bg-navy">
      <Header />
      <div className="flex min-h-0 flex-1">
        <SidebarNav />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}