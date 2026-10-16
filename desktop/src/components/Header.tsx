import {
  Bell,
  ChevronDown,
  Radio,
  Settings,
  Timer,
} from 'lucide-react';
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
    <div className="shrink-0 bg-navy">
      {/* Dedicated window-control row */}
      <div
        className="flex h-10 items-center justify-start gap-2 bg-navy px-4"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <img
          src={Logo}
          alt="FaithStream"
          className="h-15 w-15 object-contain"
          draggable={false}
        />
        <span className="select-none text-sm font-semibold tracking-wide text-white">
          FaithStream
        </span>
      </div>

      {/* Main application header */}
      <header className="relative z-10 flex h-16 shrink-0 items-center justify-between border-t border-b border-white/10 bg-navy px-5">
        {/* LEFT: logo + service selector */}
        <div className="flex min-w-0 items-center">
          <button className="flex min-w-0 items-center gap-3 text-left">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white">
                {serviceName}
              </div>
              <div className="truncate text-xs text-white/50">
                {serviceDate}
              </div>
            </div>
            <ChevronDown size={16} className="shrink-0 text-white/60" />
          </button>
        </div>

        {/* RIGHT: status, Go Live, timer, actions, user */}
        <div className="flex shrink-0 items-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                isConnected ? 'bg-emerald-400' : 'bg-red-500'
              }`}
            />
            <div className="leading-tight">
              <div
                className={`text-xs ${
                  isConnected ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {isConnected ? 'Connected' : 'Disconnected'}
              </div>
              <div className="text-[11px] text-white/50">{platform}</div>
            </div>
          </div>

          <button
            onClick={onGoLive}
            className="flex shrink-0 items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            <Radio size={16} />
            Go Live
          </button>

          <div className="flex shrink-0 items-center gap-2 text-sm text-white/80">
            <Timer size={16} />
            <span className="tabular-nums">{elapsed}</span>
          </div>

          <div className="h-8 w-px shrink-0 bg-white/10" />

          <div className="flex shrink-0 items-center gap-4 text-white/80">
            <button
              className="transition hover:text-white"
              aria-label="Notifications"
            >
              <Bell size={18} />
            </button>
            <button
              className="transition hover:text-white"
              aria-label="Settings"
            >
              <Settings size={18} />
            </button>
          </div>

          <button className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-600 text-xs font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0 text-left leading-tight">
              <div className="truncate text-sm text-white">{userName}</div>
              <div className="truncate text-[11px] text-white/50">
                {userRole}
              </div>
            </div>
            <ChevronDown size={16} className="shrink-0 text-white/60" />
          </button>
        </div>
      </header>
    </div>
  );
};

export default Header;