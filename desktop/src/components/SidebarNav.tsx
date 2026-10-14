import { NavLink } from 'react-router-dom';
import {
  Monitor,
  FileText,
  Search,
  Music,
  FolderOpen,
  CalendarDays,
  Settings,
  type LucideIcon,
} from 'lucide-react';
// import Tagline from '../assets/img/Tagline.png';

type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
};

const navItems: NavItem[] = [
  { label: 'Studio', to: '/', icon: Monitor, end: true },
  { label: 'Presentations', to: '/presentations', icon: FileText },
//   { label: 'Bible Search', to: '/bible', icon: Search },
//   { label: 'Songs & Lyrics', to: '/songs', icon: Music },
//   { label: 'Media Library', to: '/media', icon: FolderOpen },
//   { label: 'Services', to: '/services', icon: CalendarDays },
  { label: 'Settings', to: '/settings', icon: Settings },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-4 rounded-lg px-4 py-3 text-sm font-medium transition ${
    isActive
      ? 'bg-brand text-white shadow-md'
      : 'text-slate-300 hover:bg-white/5 hover:text-white'
  }`;

export default function SidebarNav() {
  return (
    <nav className="flex w-60 shrink-0 flex-col justify-between border-r border-white/5 bg-navy p-3">
      <div className="flex flex-col gap-1">
        {navItems.map(({ label, to, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={linkClass}>
            <Icon size={20} strokeWidth={1.75} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>

      <div className="flex justify-center pb-4">
        {/* <img src={Tagline} alt="Together in His Mission" className="w-40 object-contain" /> */}
      </div>
    </nav>
  );
}