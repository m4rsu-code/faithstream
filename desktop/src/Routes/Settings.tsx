import { useEffect, useState } from 'react';
import { Check, CircleUserRound, LogOut, MonitorPlay, Palette, Radio, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { signOutLocalAccount, updateLocalAccountName } from '../components/AuthGate';

const KEYS = {
  previewMode: 'faithstream.studio-preview-mode',
  confirmEnd: 'faithstream.studio-confirm-end',
  resolution: 'faithstream.studio-resolution',
  frameRate: 'faithstream.studio-frame-rate',
  bitrate: 'faithstream.studio-bitrate',
  profile: 'faithstream.user-profile',
  theme: 'faithstream.theme',
} as const;

type ThemeName = 'midnight' | 'light' | 'ocean' | 'forest' | 'plum';
const themes: { id: ThemeName; name: string; description: string; colors: [string, string, string] }[] = [
  { id: 'midnight', name: 'Midnight', description: 'FaithStream’s dark look', colors: ['#101923', '#192431', '#CB874C'] },
  { id: 'light', name: 'Light', description: 'Bright surfaces and dark text', colors: ['#F4F6F9', '#FFFFFF', '#A95119'] },
  { id: 'ocean', name: 'Ocean', description: 'Deep blue with aqua accents', colors: ['#091B24', '#163440', '#54C6D3'] },
  { id: 'forest', name: 'Forest', description: 'Deep green with soft green accents', colors: ['#111D16', '#24382A', '#9BCB7A'] },
  { id: 'plum', name: 'Plum', description: 'Deep purple with lavender accents', colors: ['#1A1421', '#30253B', '#D1A0F2'] },
];

type UserProfile = { name: string; role: string; email: string };
const defaultProfile: UserProfile = { name: 'John Doe', role: 'Media Team', email: '' };
const readProfile = (): UserProfile => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEYS.profile) ?? 'null') as Partial<UserProfile> | null;
    return saved ? { ...defaultProfile, ...saved } : defaultProfile;
  } catch { return defaultProfile; }
};

function PreferenceSwitch({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-warm-white">{label}</p>
        <p className="mt-1 text-xs leading-relaxed text-warm-white/50">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${checked ? 'bg-brand' : 'bg-white/15'}`}
      >
        <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}

function SettingsCard({ icon: Icon, title, description, children }: {
  icon: typeof SettingsIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-panel p-5">
      <div className="flex items-start gap-3 border-b border-white/10 pb-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"><Icon size={18} /></span>
        <div>
          <h2 className="text-sm font-semibold text-warm-white">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-warm-white/50">{description}</p>
        </div>
      </div>
      <div className="pt-1">{children}</div>
    </section>
  );
}

const selectClass = 'mt-1.5 w-full rounded-lg border border-white/10 bg-navy px-3 py-2.5 text-sm text-warm-white outline-none focus:border-brand';

export default function Settings() {
  const [previewMode, setPreviewMode] = useState(() => localStorage.getItem(KEYS.previewMode) !== 'false');
  const [confirmEnd, setConfirmEnd] = useState(() => localStorage.getItem(KEYS.confirmEnd) !== 'false');
  const [resolution, setResolution] = useState(() => localStorage.getItem(KEYS.resolution) || '1080p');
  const [frameRate, setFrameRate] = useState(() => localStorage.getItem(KEYS.frameRate) || '30');
  const [bitrate, setBitrate] = useState(() => localStorage.getItem(KEYS.bitrate) || '6000');
  const [profile, setProfile] = useState<UserProfile>(readProfile);
  const [theme, setTheme] = useState<ThemeName>(() => {
    const saved = localStorage.getItem(KEYS.theme);
    return themes.some((option) => option.id === saved) ? saved as ThemeName : 'midnight';
  });
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => { localStorage.setItem(KEYS.previewMode, String(previewMode)); }, [previewMode]);
  useEffect(() => { localStorage.setItem(KEYS.confirmEnd, String(confirmEnd)); }, [confirmEnd]);
  useEffect(() => { localStorage.setItem(KEYS.resolution, resolution); }, [resolution]);
  useEffect(() => { localStorage.setItem(KEYS.frameRate, frameRate); }, [frameRate]);
  useEffect(() => { localStorage.setItem(KEYS.bitrate, bitrate); }, [bitrate]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(KEYS.theme, theme);
  }, [theme]);

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = {
      name: profile.name.trim() || defaultProfile.name,
      role: profile.role.trim() || defaultProfile.role,
      email: profile.email.trim(),
    };
    try {
      localStorage.setItem(KEYS.profile, JSON.stringify(next));
      updateLocalAccountName(next.name);
      setProfile(next);
      window.dispatchEvent(new CustomEvent('faithstream:profile-updated', { detail: next }));
      setSavedMessage('Profile saved');
      window.setTimeout(() => setSavedMessage(''), 2200);
    } catch {
      setSavedMessage('Could not save profile on this device');
    }
  };

  return (
    <main className="h-full min-h-0 overflow-y-auto p-6 md:p-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-7">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/15 text-brand"><SettingsIcon size={22} /></span>
            <div>
              <h1 className="text-2xl font-bold text-warm-white">Settings</h1>
              <p className="mt-1 text-sm text-warm-white/55">Set your usual preferences. You can change them any time.</p>
            </div>
          </div>
        </header>

        <div className="grid gap-4">
          <SettingsCard icon={CircleUserRound} title="Your profile" description="Choose the name and role shown in FaithStream.">
            <form onSubmit={saveProfile}>
              <div className="flex items-center gap-3 py-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/20 text-sm font-bold text-brand">
                  {profile.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'JD'}
                </span>
                <div>
                  <p className="text-sm font-semibold text-warm-white">{profile.name || 'Your name'}</p>
                  <p className="text-xs text-warm-white/50">Profile is saved on this device</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-warm-white/65">Name
                  <input value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} className={selectClass} placeholder="Your name" autoComplete="name" />
                </label>
                <label className="text-xs font-medium text-warm-white/65">Role
                  <input value={profile.role} onChange={(event) => setProfile((current) => ({ ...current, role: event.target.value }))} className={selectClass} placeholder="e.g. Media Team" />
                </label>
                <label className="text-xs font-medium text-warm-white/65 sm:col-span-2">Email address (optional)
                  <input type="email" value={profile.email} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} className={selectClass} placeholder="you@example.com" autoComplete="email" />
                </label>
              </div>
              <div className="mt-4 flex items-center justify-end gap-3">
                <span role="status" className="text-xs text-warm-white/55">{savedMessage}</span>
                <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-navy transition hover:brightness-110">Save profile</button>
              </div>
            </form>
            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
              <div><p className="text-sm font-medium text-warm-white">Signed in on this computer</p><p className="mt-1 text-xs text-warm-white/45">Sign out to return to the login screen.</p></div>
              <button type="button" onClick={signOutLocalAccount} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-warm-white/75 transition hover:bg-white/5 hover:text-white"><LogOut size={15} />Sign out</button>
            </div>
          </SettingsCard>

          <SettingsCard icon={Palette} title="App colors" description="Pick a look for FaithStream. Your choice applies throughout the app and is remembered on this device.">
            <div className="grid gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-3">
              {themes.map((option) => {
                const selected = theme === option.id;
                return <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTheme(option.id)}
                  className={`rounded-xl border p-3 text-left transition ${selected ? 'border-brand ring-1 ring-brand/60' : 'border-white/10 hover:border-white/25'}`}
                >
                  <span className="mb-3 flex h-14 overflow-hidden rounded-lg border border-black/10" style={{ backgroundColor: option.colors[0] }}>
                    <span className="m-2 flex-1 rounded-md" style={{ backgroundColor: option.colors[1] }} />
                    <span className="m-2 ml-0 w-2 rounded-full" style={{ backgroundColor: option.colors[2] }} />
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span>
                      <span className="block text-sm font-semibold text-warm-white">{option.name}</span>
                      <span className="mt-0.5 block text-[11px] text-warm-white/50">{option.description}</span>
                    </span>
                    {selected && <Check size={16} className="shrink-0 text-brand" />}
                  </span>
                </button>;
              })}
            </div>
          </SettingsCard>

          <SettingsCard icon={MonitorPlay} title="Presenting slides" description="Choose how slides move from your preview to the screen.">
            <PreferenceSwitch
              label="Preview slides before showing them"
              description="When on, check a slide in Preview first, then choose Take to air. When off, slide changes appear right away."
              checked={previewMode}
              onChange={setPreviewMode}
            />
            <div className="border-t border-white/10 pt-3 text-xs leading-relaxed text-warm-white/50">
              Keyboard: <span className="text-warm-white/75">↑ or ←</span> previous slide · <span className="text-warm-white/75">↓ or →</span> next slide.
            </div>
          </SettingsCard>

          <SettingsCard icon={ShieldCheck} title="Live stream safety" description="Avoid ending a live stream by mistake.">
            <PreferenceSwitch
              label="Ask before ending a live stream"
              description="Show a confirmation before the stream stops."
              checked={confirmEnd}
              onChange={setConfirmEnd}
            />
          </SettingsCard>

          <SettingsCard icon={SlidersHorizontal} title="Default stream quality" description="These choices will be selected when you open Go Live. You can still change them there.">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-warm-white/65">Picture size
                <select value={resolution} onChange={(event) => setResolution(event.target.value)} className={selectClass}>
                  <option value="720p">720p · Uses less internet</option>
                  <option value="1080p">1080p · Sharper picture</option>
                </select>
              </label>
              <label className="text-xs font-medium text-warm-white/65">Smoothness
                <select value={frameRate} onChange={(event) => setFrameRate(event.target.value)} className={selectClass}>
                  <option value="30">30 frames per second</option>
                  <option value="60">60 frames per second</option>
                </select>
              </label>
              <label className="text-xs font-medium text-warm-white/65">Internet use
                <select value={bitrate} onChange={(event) => setBitrate(event.target.value)} className={selectClass}>
                  <option value="2500">Low · 2,500 kbps</option>
                  <option value="4500">Balanced · 4,500 kbps</option>
                  <option value="6000">High · 6,000 kbps</option>
                </select>
              </label>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-warm-white/45">Higher quality uses more internet. If your connection is slow, choose 720p and Low.</p>
          </SettingsCard>

          <SettingsCard icon={Radio} title="Your settings stay on this device" description="These preferences are saved on this computer and apply the next time you use Studio." >
            <p className="py-3 text-xs leading-relaxed text-warm-white/50">Your stream key is not saved here. Add it in Go Live when you are ready to connect.</p>
          </SettingsCard>
        </div>
      </div>
    </main>
  );
}
