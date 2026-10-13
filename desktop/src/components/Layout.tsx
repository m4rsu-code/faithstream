import { NavLink, Outlet } from 'react-router-dom';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-brand/20 text-brand' : 'text-warm-white hover:bg-white/5'
  }`;

export default function Layout() {
  return (
    <div className="flex h-screen bg-navy">
      <nav className="flex w-56 flex-col gap-1 border-r border-brand/20 bg-panel p-4">
        <h2 className="mb-4 text-lg font-bold text-brand">FaithStream</h2>
        <NavLink to="/" end className={linkClass}>Home</NavLink>
        <NavLink to="/slides" className={linkClass}>Slides</NavLink>
      </nav>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}