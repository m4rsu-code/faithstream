import {
  Bell,
  CalendarClock,
  Check,
  ChevronDown,
  CircleAlert,
  Radio,
  Minus,
  Pencil,
  Square,
  X,
  Timer,
  Trash2,
  LogOut,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Logo from '../assets/img/Logo.png';
import { signOutLocalAccount } from './AuthGate';

const SERVICE_HEADER_KEY = 'faithstream.service-header';
const USER_PROFILE_KEY = 'faithstream.user-profile';
const DEFAULT_SERVICE_NAME = 'Sunday Worship Service';
type UserProfile = { name: string; role: string; email: string };
const readUserProfile = (): UserProfile => {
  try {
    const saved = JSON.parse(localStorage.getItem(USER_PROFILE_KEY) ?? 'null') as Partial<UserProfile> | null;
    return { name: saved?.name || 'John Doe', role: saved?.role || 'Media Team', email: saved?.email || '' };
  } catch { return { name: 'John Doe', role: 'Media Team', email: '' }; }
};

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
const NOTIFICATIONS_KEY = 'faithstream.notifications';
type AppNotification = { id: string; title: string; message: string; createdAt: number; read: boolean; kind: 'info' | 'error' };
const readNotifications = (): AppNotification[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) ?? '[]') as AppNotification[];
    return Array.isArray(saved) ? saved.slice(0, 30) : [];
  } catch { return []; }
};
const readStudioSession = (): StudioSession => {
  try {
    const saved = JSON.parse(localStorage.getItem(STUDIO_SESSION_KEY) ?? 'null') as StudioSession | null;
    if (saved && typeof saved.live === 'boolean' && typeof saved.recording === 'boolean') return saved;
  } catch { /* Start with an offline header when session state is unavailable. */ }
  return { live: false, recording: false, streamStatus: 'idle', startedAt: null };
};

const Header: React.FC<HeaderProps> = ({
  userName: providedUserName,
  userRole: providedUserRole,
  onGoLive,
}) => {
  const [profile, setProfile] = useState<UserProfile>(readUserProfile);
  const userName = providedUserName || profile.name;
  const userRole = providedUserRole || profile.role;
  const [serviceName, setServiceName] = useState(readServiceHeader);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(serviceName);
  const [now, setNow] = useState(() => new Date());
  const [studioSession, setStudioSession] = useState<StudioSession>(readStudioSession);
  const [notifications, setNotifications] = useState<AppNotification[]>(readNotifications);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const notificationPanelRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const previousSession = useRef(readStudioSession());
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  useEffect(() => {
    try { localStorage.setItem(SERVICE_HEADER_KEY, JSON.stringify({ name: serviceName })); } catch { /* Keep the current header usable if storage is unavailable. */ }
  }, [serviceName]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications)); } catch { /* Keep notifications visible for this session if storage is full. */ }
  }, [notifications]);

  useEffect(() => {
    const addNotification = (title: string, message: string, kind: AppNotification['kind'] = 'info') => {
      setNotifications((current) => [{ id: crypto.randomUUID(), title, message, createdAt: Date.now(), read: false, kind }, ...current].slice(0, 30));
    };
    const updateSession = (next: StudioSession) => {
      const previous = previousSession.current;
      if (next.streamStatus === 'error' && previous.streamStatus !== 'error') {
        addNotification('Stream connection problem', next.streamStatus === 'error' ? 'Check your stream URL, stream key, and internet connection.' : 'The stream could not connect.', 'error');
      } else if (next.live && next.streamStatus === 'live' && previous.streamStatus !== 'live') {
        addNotification('You are live', 'Your stream is connected and on air.');
      }
      if (next.recording && !previous.recording) addNotification('Recording started', 'FaithStream is recording your program.');
      if (!next.recording && previous.recording) addNotification('Recording stopped', 'Your recording has finished.');
      previousSession.current = next;
      setStudioSession(next);
    };
    const onSessionChange = (event: Event) => {
      const next = (event as CustomEvent<StudioSession>).detail;
      if (next && typeof next.live === 'boolean' && typeof next.recording === 'boolean') updateSession(next);
    };
    const onStorageChange = (event: StorageEvent) => {
      if (event.key === STUDIO_SESSION_KEY) updateSession(readStudioSession());
    };
    const unsubscribeRecording = window.faithstreamWindow?.onRecordingStatus((event) => {
      if (event.status === 'error') addNotification('Recording problem', event.message || 'The recording could not be completed.', 'error');
    });
    window.addEventListener('faithstream:studio-session', onSessionChange);
    window.addEventListener('storage', onStorageChange);
    return () => {
      unsubscribeRecording?.();
      window.removeEventListener('faithstream:studio-session', onSessionChange);
      window.removeEventListener('storage', onStorageChange);
    };
  }, []);

  useEffect(() => {
    if (!notificationsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!notificationPanelRef.current?.contains(event.target as Node)) setNotificationsOpen(false);
    };
    window.addEventListener('pointerdown', closeOutside);
    return () => window.removeEventListener('pointerdown', closeOutside);
  }, [notificationsOpen]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setProfileMenuOpen(false); };
    window.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    const updateProfile = (event?: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as Partial<UserProfile> : null;
      setProfile(detail?.name ? {
        name: detail.name,
        role: detail.role || 'Media Team',
        email: detail.email || '',
      } : readUserProfile());
    };
    const onStorage = (event: StorageEvent) => { if (event.key === USER_PROFILE_KEY) updateProfile(); };
    window.addEventListener('faithstream:profile-updated', updateProfile);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('faithstream:profile-updated', updateProfile);
      window.removeEventListener('storage', onStorage);
    };
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
              <form onSubmit={(event) => { event.preventDefault(); const name = nameDraft.trim() || serviceName || DEFAULT_SERVICE_NAME; setServiceName(name); setNameDraft(name); setEditingName(false); }} className="flex items-center gap-1">
                <input autoFocus aria-label="Service title" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setNameDraft(serviceName); setEditingName(false); } }} className="w-64 rounded bg-white/5 px-2 py-1 text-sm font-medium text-white outline-none ring-1 ring-brand" />
                <button type="submit" aria-label="Save service title" className="rounded p-1 text-emerald-300 hover:bg-white/10"><Check size={15} /></button>
                <button type="button" aria-label="Cancel title edit" onClick={() => { setNameDraft(serviceName); setEditingName(false); }} className="rounded p-1 text-white/50 hover:bg-white/10"><X size={15} /></button>
              </form>
            ) : (
              <div className="flex items-center gap-1">
                <button type="button" aria-label={`Edit service title: ${serviceName}`} title="Click to change the service title" onClick={() => { setNameDraft(serviceName); setEditingName(true); }} className="max-w-64 truncate text-left text-sm font-medium text-white hover:text-brand">{serviceName}</button>
                <button type="button" aria-label="Edit service title" title="Edit service title" onClick={() => { setNameDraft(serviceName); setEditingName(true); }} className="rounded p-1 text-white/45 hover:bg-white/10 hover:text-white"><Pencil size={12} /></button>
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
            <div className="relative" ref={notificationPanelRef}>
              <button
                type="button"
                className="relative rounded-md p-1 transition hover:bg-white/5 hover:text-white"
                aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
                aria-expanded={notificationsOpen}
                onClick={() => {
                  const opening = !notificationsOpen;
                  setNotificationsOpen(opening);
                  if (opening) setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
                }}
              >
                <Bell size={18} />
                {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold leading-none text-navy">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>
              {notificationsOpen && <section role="dialog" aria-label="Notifications" className="absolute right-0 top-10 z-[120] w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-xl border border-white/10 bg-[#101d2a] text-left shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Notifications</h2>
                    <p className="mt-0.5 text-[11px] text-white/45">Stream and recording updates</p>
                  </div>
                  {notifications.length > 0 && <button type="button" onClick={() => setNotifications([])} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-white/55 hover:bg-white/5 hover:text-white"><Trash2 size={12} /> Clear all</button>}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? <div className="px-4 py-8 text-center">
                    <Bell size={20} className="mx-auto text-white/30" />
                    <p className="mt-2 text-sm text-white/65">You’re all caught up</p>
                    <p className="mt-1 text-xs text-white/40">Stream and recording updates will show here.</p>
                  </div> : notifications.map((notification) => <article key={notification.id} className="flex gap-3 border-b border-white/5 px-4 py-3 last:border-0">
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${notification.kind === 'error' ? 'bg-red-500/15 text-red-300' : 'bg-brand/10 text-brand'}`}>
                      {notification.kind === 'error' ? <CircleAlert size={15} /> : <Check size={15} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-xs font-semibold text-white">{notification.title}</h3>
                        <time className="shrink-0 text-[10px] text-white/35">{new Date(notification.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-white/55">{notification.message}</p>
                    </div>
                  </article>)}
                </div>
              </section>}
            </div>
          </div>

          <div className="relative" ref={profileMenuRef}>
            <button type="button" aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)} className="flex min-w-0 items-center gap-3 rounded-lg px-1.5 py-1 transition hover:bg-white/5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-600 text-xs font-semibold text-white">
                {initials}
              </div>
              <div className="min-w-0 text-left leading-tight">
                <div className="truncate text-sm text-white">{userName}</div>
                <div className="truncate text-[11px] text-white/50">{userRole}</div>
              </div>
              <ChevronDown size={16} className={`shrink-0 text-white/60 transition-transform ${profileMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {profileMenuOpen && <div role="menu" aria-label="Profile menu" className="absolute right-0 top-full z-[130] mt-2 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#101d2a] p-1.5 text-left shadow-2xl">
              <div className="border-b border-white/10 px-3 py-2.5">
                <p className="truncate text-sm font-semibold text-white">{userName}</p>
                <p className="truncate text-xs text-white/50">{profile.email || userRole}</p>
              </div>
              <button type="button" role="menuitem" onClick={signOutLocalAccount} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-white/75 transition hover:bg-red-500/10 hover:text-red-200">
                <LogOut size={16} /> Sign out
              </button>
            </div>}
          </div>
        </div>
      </header>
    </div>
  );
};

export default Header;
