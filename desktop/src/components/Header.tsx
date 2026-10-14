import { Bell, ChevronDown, Radio, Settings, Timer } from 'lucide-react';
import Logo from '../assets/img/Logo.png';

type HeaderProps = {
  serviceName?: string;
  serviceDate?: string;
  isConnected?: boolean;
  platform?: string;
  elapsed?: string;
  userName?: string;
  userRole?: string;
  onGoLive?: () => void;
};

const Header: React.FC<HeaderProps> = ({
  serviceName = 'Sunday Worship Service',
  serviceDate = 'Apr 27, 2025 · 10:00 AM',
  isConnected = true,
  platform = 'Facebook Live',
  elapsed = '00:34:12',
  userName = 'John Doe',
  userRole = 'Media Team',
  onGoLive,
}) => {
  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-brand/20 bg-navy px-5">
      {/* LEFT: logo + service selector */}
      <div className="flex items-center">
        <div className="flex items-center gap-3 pr-6">
          {/* Replace /Logo.png with your real logo file in /public */}
          <img src={Logo} alt="FaithStream Studio" className="h-20 w-20 object-contain" />
        </div>

        <div className="h-8 w-px bg-white/10" />

        <button className="ml-6 flex items-center gap-3 text-left">
          <div>
            <div className="text-sm font-medium text-white">{serviceName}</div>
            <div className="text-xs text-white/50">{serviceDate}</div>
          </div>
          <ChevronDown size={16} className="text-white/60" />
        </button>
      </div>

      {/* RIGHT: status, go live, timer, actions, user */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-500'}`}
          />
          <div className="leading-tight">
            <div className={`text-xs ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
            <div className="text-[11px] text-white/50">{platform}</div>
          </div>
        </div>

        <button
          onClick={onGoLive}
          className="flex items-center gap-2 rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
        >
          <Radio size={16} />
          Go Live
        </button>

        <div className="flex items-center gap-2 text-sm text-white/80">
          <Timer size={16} />
          <span className="tabular-nums">{elapsed}</span>
        </div>

        <div className="h-8 w-px bg-white/10" />

        <div className="flex items-center gap-4 text-white/80">
          <button className="transition hover:text-white" aria-label="Notifications">
            <Bell size={18} />
          </button>
          <button className="transition hover:text-white" aria-label="Settings">
            <Settings size={18} />
          </button>
        </div>

        <button className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-600 text-xs font-semibold text-white">
            {initials}
          </div>
          <div className="text-left leading-tight">
            <div className="text-sm text-white">{userName}</div>
            <div className="text-[11px] text-white/50">{userRole}</div>
          </div>
          <ChevronDown size={16} className="text-white/60" />
        </button>
      </div>
    </header>
  );
};

export default Header;