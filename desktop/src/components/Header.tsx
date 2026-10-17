import {
  Bell,
  CalendarClock,
  Check,
  ChevronDown,
  Radio,
  Settings,
  Minus,
  Pencil,
  Square,
  X,
  Timer,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import Logo from '../assets/img/Logo.png';

const SERVICE_HEADER_KEY = 'faithstream.service-header';
const DEFAULT_SERVICE_NAME = 'Sunday Worship Service';

function readServiceHeader() {
  try {
    const saved = localStorage.getItem(SERVICE_HEADER_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as { name?: string };
      return parsed.name || DEFAULT_SERVICE_NAME;
    }
  } catch { /* Use the defaults when saved settings are unavailable. */ }
  return DEFAULT_SERVICE_NAME;
}

type HeaderProps = {
  userName?: string;
  userRole?: string;
  onGoLive?: () => void;
};

type StudioSession = { live: boolean; recording: boolean; streamStatus: string; startedAt: number | null };
const STUDIO_SESSION_KEY = 'faithstream.studio-session';
const readStudioSession = (): StudioSession => {
  try {
    const saved = JSON.parse(localStorage.getItem(STUDIO_SESSION_KEY) ?? 'null') as StudioSession | null;
    if (saved && typeof saved.live === 'boolean' && typeof saved.recording === 'boolean') return saved;
  } catch { /* Start with an offline header when session state is unavailable. */ }
  return { live: false, recording: false, streamStatus: 'idle', startedAt: null };
};

const Header: React.FC<HeaderProps> = ({
  userName = 'John Doe',
  userRole = 'Media Team',
  onGoLive,
}) => {
  const [serviceName, setServiceName] = useState(readServiceHeader);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(serviceName);
  const [now, setNow] = useState(() => new Date());
  const [studioSession, setStudioSession] = useState<StudioSession>(readStudioSession);

  useEffect(() => {
    try { localStorage.setItem(SERVICE_HEADER_KEY, JSON.stringify({ name: serviceName })); } catch { /* Keep the current header usable if storage is unavailable. */ }
  }, [serviceName]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onSessionChange = (event: Event) => {
      const next = (event as CustomEvent<StudioSession>).detail;
      if (next && typeof next.live === 'boolean' && typeof next.recording === 'boolean') setStudioSession(next);
    };
    const onStorageChange = (event: StorageEvent) => {
      if (event.key === STUDIO_SESSION_KEY) setStudioSession(readStudioSession());
    };
    window.addEventListener('faithstream:studio-session', onSessionChange);
    window.addEventListener('storage', onStorageChange);
    return () => {
      window.removeEventListener('faithstream:studio-session', onSessionChange);
      window.removeEventListener('storage', onStorageChange);
    };
  }, []);

  const formattedDateTime = `${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  const connected = studioSession.live && studioSession.streamStatus === 'live';
  const connecting = studioSession.live && studioSession.streamStatus === 'connecting';
  const recordingOnly = studioSession.recording && !studioSession.live;
  const statusLabel = connected ? 'Connected' : connecting ? 'Connecting' : recordingOnly ? 'Recording' : studioSession.live ? 'Stream issue' : 'Offline';
  const elapsedSeconds = studioSession.startedAt && (studioSession.live || studioSession.recording)
    ? Math.max(0, Math.floor((now.getTime() - studioSession.startedAt) / 1000))
    : 0;
  const elapsed = [Math.floor(elapsedSeconds / 3600), Math.floor((elapsedSeconds % 3600) / 60), elapsedSeconds % 60]
    .map((part) => String(part).padStart(2, '0')).join(':');

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
        className="flex h-10 items-center justify-between bg-navy px-3"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
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
        <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button aria-label="Minimize window" onClick={() => void window.faithstreamWindow?.minimize()} className="flex w-11 items-center justify-center text-white/70 hover:bg-white/10 hover:text-white"><Minus size={14} /></button>
          <button aria-label="Maximize window" onClick={() => void window.faithstreamWindow?.toggleMaximize()} className="flex w-11 items-center justify-center text-white/70 hover:bg-white/10 hover:text-white"><Square size={12} /></button>
          <button aria-label="Close window" onClick={() => void window.faithstreamWindow?.close()} className="flex w-11 items-center justify-center text-white/70 hover:bg-red-600 hover:text-white"><X size={15} /></button>
        </div>
      </div>

      {/* Main application header */}
      <header className="relative z-20 flex h-16 shrink-0 items-center justify-between border-t border-b border-white/10 bg-navy px-5">
        {/* Service title and its scheduled date remain in a fixed header position. */}
        <div className="relative flex min-w-0 items-center gap-2">
          <div className="min-w-0">
            {editingName ? (
              <form onSubmit={(event) => { event.preventDefault(); const name = nameDraft.trim() || 'Untitled service'; setServiceName(name); setNameDraft(name); setEditingName(false); }} className="flex items-center gap-1">
                <input autoFocus aria-label="Service title" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setNameDraft(serviceName); setEditingName(false); } }} className="w-64 rounded bg-white/5 px-2 py-1 text-sm font-medium text-white outline-none ring-1 ring-brand" />
                <button type="submit" aria-label="Save service title" className="rounded p-1 text-emerald-300 hover:bg-white/10"><Check size={15} /></button>
                <button type="button" aria-label="Cancel title edit" onClick={() => { setNameDraft(serviceName); setEditingName(false); }} className="rounded p-1 text-white/50 hover:bg-white/10"><X size={15} /></button>
              </form>
            ) : (
              <div className="flex items-center gap-1">
                <span className="max-w-64 truncate text-sm font-medium text-white">{serviceName}</span>
                <button aria-label="Edit service title" title="Edit service title" onClick={() => { setNameDraft(serviceName); setEditingName(true); }} className="rounded p-1 text-white/45 hover:bg-white/10 hover:text-white"><Pencil size={12} /></button>
              </div>
            )}
            <div aria-label="Current date and time" className="flex items-center gap-1 text-xs text-white/50"><CalendarClock size={12} /> <span>{formattedDateTime}</span></div>
          </div>
        </div>

        {/* RIGHT: status, Go Live, timer, actions, user */}
        <div className="flex shrink-0 items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : connecting ? 'animate-pulse bg-amber-300' : recordingOnly || studioSession.live ? 'bg-red-400' : 'bg-white/25'}`} />
            <div className="leading-tight">
              <div className={`text-xs ${connected ? 'text-emerald-400' : connecting ? 'text-amber-300' : recordingOnly || studioSession.live ? 'text-red-300' : 'text-white/45'}`}>{statusLabel}</div>
              <div className="text-[11px] text-white/50">{recordingOnly ? 'Local recording' : 'Facebook Live'}</div>
            </div>
          </div>

          <button
            onClick={() => onGoLive ? onGoLive() : window.dispatchEvent(new Event('faithstream:header-toggle-live'))}
            className={`flex shrink-0 items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 ${studioSession.live ? 'bg-red-600' : 'bg-brand'}`}
          >
            {studioSession.live ? <Square size={14} /> : <Radio size={16} />}
            {studioSession.live ? 'End Stream' : 'Go Live'}
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
