import { useEffect, useRef, useState } from 'react';
import { Camera, Check, CircleUserRound, Loader2, LogOut, MonitorPlay, Palette, Radio, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { FormEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { removeLocalAccountProfilePhoto, signOutLocalAccount, updateLocalAccountProfile, updateLocalAccountProfilePhoto, updateLocalAccountProfilePhotoPosition } from '../components/AuthGate';

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

type PhotoPosition = { x: number; y: number };
type UserProfile = { name: string; role: string; email: string; photoUrl: string | null; photoPosition: PhotoPosition };
const defaultProfile: UserProfile = { name: 'John Doe', role: 'Media Team', email: '', photoUrl: null, photoPosition: { x: 50, y: 50 } };
const readProfile = (): UserProfile => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEYS.profile) ?? 'null') as Partial<UserProfile> | null;
    return saved ? { ...defaultProfile, ...saved, photoPosition: saved.photoPosition ?? defaultProfile.photoPosition } : defaultProfile;
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
  const [resolution, setResolution] = useState(() => localStorage.getItem(KEYS.resolution) || '720p');
  const [frameRate, setFrameRate] = useState(() => localStorage.getItem(KEYS.frameRate) || '30');
  const [bitrate, setBitrate] = useState(() => localStorage.getItem(KEYS.bitrate) || '4500');
  const [profile, setProfile] = useState<UserProfile>(readProfile);
  const [theme, setTheme] = useState<ThemeName>(() => {
    const saved = localStorage.getItem(KEYS.theme);
    return themes.some((option) => option.id === saved) ? saved as ThemeName : 'midnight';
  });
  const [savedMessage, setSavedMessage] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoMessage, setPhotoMessage] = useState('');
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSaving, setCropSaving] = useState(false);
  const [cropPosition, setCropPosition] = useState<PhotoPosition>(profile.photoPosition);
  const profilePhotoInput = useRef<HTMLInputElement>(null);
  const cropPreviewRef = useRef<HTMLDivElement>(null);
  const cropDragRef = useRef<{ pointerId: number; x: number; y: number; clientX: number; clientY: number } | null>(null);

  useEffect(() => { localStorage.setItem(KEYS.previewMode, String(previewMode)); }, [previewMode]);
  useEffect(() => { localStorage.setItem(KEYS.confirmEnd, String(confirmEnd)); }, [confirmEnd]);
  useEffect(() => { localStorage.setItem(KEYS.resolution, resolution); }, [resolution]);
  useEffect(() => { localStorage.setItem(KEYS.frameRate, frameRate); }, [frameRate]);
  useEffect(() => { localStorage.setItem(KEYS.bitrate, bitrate); }, [bitrate]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(KEYS.theme, theme);
  }, [theme]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = {
      name: profile.name.trim() || defaultProfile.name,
      role: profile.role.trim() || defaultProfile.role,
    };
    setProfileSaving(true);
    setSavedMessage('Saving to your account…');
    try {
      await updateLocalAccountProfile(next.name, next.role);
      setProfile(readProfile());
      setSavedMessage('Profile saved to your account');
      window.setTimeout(() => setSavedMessage(''), 2200);
    } catch (cause) {
      setSavedMessage(cause instanceof Error && cause.message !== 'Failed to fetch'
        ? cause.message
        : 'Could not reach the server. Check your connection and try again.');
    } finally {
      setProfileSaving(false);
    }
  };

  const changeProfilePhoto = async (photo?: File) => {
    if (!photo) return;
    if (photo.size > 2 * 1024 * 1024) {
      setPhotoMessage('Choose a photo that is 2 MB or smaller.');
      return;
    }
    setPhotoSaving(true);
    setPhotoMessage('Uploading photo…');
    try {
      await updateLocalAccountProfilePhoto(photo);
      setProfile(readProfile());
      setPhotoMessage('Profile photo updated');
    } catch (cause) {
      setPhotoMessage(cause instanceof Error && cause.message !== 'Failed to fetch'
        ? cause.message
        : 'Could not reach the server. Check your connection and try again.');
    } finally {
      setPhotoSaving(false);
    }
  };

  const removeProfilePhoto = async () => {
    setPhotoSaving(true);
    setPhotoMessage('Removing photo…');
    try {
      await removeLocalAccountProfilePhoto();
      setProfile(readProfile());
      setPhotoMessage('Profile photo removed');
    } catch (cause) {
      setPhotoMessage(cause instanceof Error && cause.message !== 'Failed to fetch'
        ? cause.message
        : 'Could not reach the server. Check your connection and try again.');
    } finally {
      setPhotoSaving(false);
    }
  };

  const openPhotoCrop = () => {
    setCropPosition(profile.photoPosition);
    setCropOpen(true);
  };

  const startPhotoCropDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!profile.photoUrl) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDragRef.current = { pointerId: event.pointerId, x: cropPosition.x, y: cropPosition.y, clientX: event.clientX, clientY: event.clientY };
  };

  const movePhotoCrop = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = cropDragRef.current;
    const viewport = cropPreviewRef.current;
    const image = viewport?.querySelector('img');
    if (!drag || drag.pointerId !== event.pointerId || !viewport || !image?.naturalWidth || !image.naturalHeight) return;
    const bounds = viewport.getBoundingClientRect();
    const aspect = image.naturalWidth / image.naturalHeight;
    const overflowX = bounds.width * Math.max(0, aspect - 1);
    const overflowY = bounds.height * Math.max(0, 1 / aspect - 1);
    setCropPosition({
      x: Math.max(0, Math.min(100, Math.round(drag.x - (overflowX ? (event.clientX - drag.clientX) / overflowX * 100 : 0)))),
      y: Math.max(0, Math.min(100, Math.round(drag.y - (overflowY ? (event.clientY - drag.clientY) / overflowY * 100 : 0)))),
    });
  };

  const savePhotoCrop = async () => {
    setCropSaving(true);
    try {
      await updateLocalAccountProfilePhotoPosition(cropPosition);
      setProfile(readProfile());
      setPhotoMessage('Photo framing saved to your account');
      setCropOpen(false);
    } catch (cause) {
      setPhotoMessage(cause instanceof Error && cause.message !== 'Failed to fetch'
        ? cause.message
        : 'Could not reach the server. Check your connection and try again.');
    } finally {
      setCropSaving(false);
    }
  };

  return (
    <>
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
          <SettingsCard icon={CircleUserRound} title="Your profile" description="Your name and role are saved to your FaithStream account. Your sign-in email is fixed.">
            <form onSubmit={saveProfile}>
              <div className="flex flex-wrap items-center gap-3 py-4">
                <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/20 text-sm font-bold text-brand">
                  {profile.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'JD'}
                  {profile.photoUrl && <img src={profile.photoUrl} alt="Profile" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `${profile.photoPosition.x}% ${profile.photoPosition.y}%` }} onError={(event) => event.currentTarget.remove()} />}
                </span>
                <div>
                  <p className="text-sm font-semibold text-warm-white">{profile.name || 'Your name'}</p>
                  <p className="text-xs text-warm-white/50">JPG, PNG, or WebP · up to 2 MB · saved to your account</p>
                  <input ref={profilePhotoInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { void changeProfilePhoto(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button type="button" disabled={photoSaving} onClick={() => profilePhotoInput.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-warm-white/80 hover:bg-white/5 disabled:opacity-50">
                      {photoSaving ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}{photoSaving ? 'Saving…' : profile.photoUrl ? 'Change photo' : 'Add photo'}
                    </button>
                    {profile.photoUrl && <button type="button" disabled={photoSaving} onClick={() => { void removeProfilePhoto(); }} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-red-200/80 hover:bg-red-500/10 disabled:opacity-50"><Trash2 size={12} />Remove</button>}
                    {profile.photoUrl && <button type="button" onClick={openPhotoCrop} className="rounded-lg px-2 py-1.5 text-xs text-brand hover:bg-brand/10">Adjust framing</button>}
                  </div>
                </div>
                {photoMessage && <span role="status" className="text-xs text-warm-white/55">{photoMessage}</span>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-warm-white/65">Name
                  <input value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} disabled={profileSaving} className={`${selectClass} disabled:cursor-wait disabled:opacity-60`} placeholder="Your name" autoComplete="name" />
                </label>
                <label className="text-xs font-medium text-warm-white/65">Role
                  <input value={profile.role} onChange={(event) => setProfile((current) => ({ ...current, role: event.target.value }))} disabled={profileSaving} className={`${selectClass} disabled:cursor-wait disabled:opacity-60`} placeholder="e.g. Media Team" />
                </label>
                <label className="text-xs font-medium text-warm-white/65 sm:col-span-2">Email address (read-only)
                  <input type="email" value={profile.email} readOnly className={`${selectClass} cursor-not-allowed opacity-70`} autoComplete="email" />
                </label>
              </div>
              <div className="mt-4 flex items-center justify-end gap-3">
                <span role="status" className="text-xs text-warm-white/55">{savedMessage}</span>
                <button type="submit" disabled={profileSaving} className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-navy transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">
                  {profileSaving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                  {profileSaving ? 'Saving profile…' : 'Save profile'}
                </button>
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

          <SettingsCard icon={SlidersHorizontal} title="Default stream quality" description="The defaults favor smoother streaming on modest computers. You can raise them here or in Go Live when your hardware can keep up.">
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
            <p className="mt-3 text-xs leading-relaxed text-warm-white/45">For a 4 GB PC, start with 720p, 30 fps, and Low or Balanced bitrate. Streaming still depends on the processor, graphics hardware, and upload speed.</p>
          </SettingsCard>

          <SettingsCard icon={Radio} title="Your settings stay on this device" description="These preferences are saved on this computer and apply the next time you use Studio." >
            <p className="py-3 text-xs leading-relaxed text-warm-white/50">Your stream key is not saved here. Add it in Go Live when you are ready to connect.</p>
          </SettingsCard>
        </div>
      </div>
    </main>
    {cropOpen && profile.photoUrl && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !cropSaving) setCropOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="profile-photo-crop-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101d2a] p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="profile-photo-crop-title" className="text-base font-semibold">Adjust profile photo</h2>
            <p className="mt-1 text-xs leading-relaxed text-white/55">Drag the photo to choose what appears in the header. The circle shows the crop.</p>
          </div>
          <button type="button" aria-label="Close photo adjustment" disabled={cropSaving} onClick={() => setCropOpen(false)} className="rounded-md p-1 text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-40">×</button>
        </div>
        <div
          ref={cropPreviewRef}
          className="mx-auto mt-5 h-64 w-64 cursor-move touch-none overflow-hidden rounded-full bg-black/30 ring-2 ring-brand/70"
          onPointerDown={startPhotoCropDrag}
          onPointerMove={movePhotoCrop}
          onPointerUp={(event) => { if (cropDragRef.current?.pointerId === event.pointerId) cropDragRef.current = null; }}
          onPointerCancel={() => { cropDragRef.current = null; }}
        >
          <img src={profile.photoUrl} alt="Profile photo crop preview" draggable={false} className="h-full w-full select-none object-cover" style={{ objectPosition: `${cropPosition.x}% ${cropPosition.y}%` }} />
        </div>
        <div className="mt-5 grid gap-4">
          <label className="text-xs text-white/65">Horizontal framing
            <input type="range" min="0" max="100" value={cropPosition.x} onChange={(event) => setCropPosition((current) => ({ ...current, x: Number(event.target.value) }))} className="mt-2 block w-full accent-[var(--color-brand)]" />
          </label>
          <label className="text-xs text-white/65">Vertical framing
            <input type="range" min="0" max="100" value={cropPosition.y} onChange={(event) => setCropPosition((current) => ({ ...current, y: Number(event.target.value) }))} className="mt-2 block w-full accent-[var(--color-brand)]" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-white/10 pt-4">
          <button type="button" disabled={cropSaving} onClick={() => setCropOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/75 hover:bg-white/5 disabled:opacity-40">Cancel</button>
          <button type="button" disabled={cropSaving} onClick={() => { void savePhotoCrop(); }} className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-wait disabled:opacity-50">{cropSaving && <Loader2 size={14} className="animate-spin" />}{cropSaving ? 'Saving…' : 'Save framing'}</button>
        </div>
      </section>
    </div>}
    </>
  );
}
