import { useEffect, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Minus, Square, X } from 'lucide-react';
import FaithStreamLogo from '../assets/img/Logo.png';
import LoadingAnimation from '../assets/img/loading.gif';

const ACCOUNTS_KEY = 'faithstream.local-accounts';
const SESSION_KEY = 'faithstream.local-session';
const PROFILE_KEY = 'faithstream.user-profile';
const TEMPORARY_SESSION = 'faithstream-temporary-session';

const requestWindowMode = async (authenticated: boolean) => {
  try {
    const handled = await window.faithstreamWindow?.setAuthenticatedMode(authenticated);
    if (handled) return;
  } catch { /* Fall back to the basic presentation window control. */ }
  try {
    await window.faithstreamWindow?.setPresentationFullscreen(authenticated);
  } catch { /* Keep sign-in and sign-out available if window controls are unavailable. */ }
};

type LocalAccount = { email: string; name: string; salt: string; passwordHash: string };
type AuthMode = 'login' | 'register';

const readAccounts = (): LocalAccount[] => {
  try {
    const value = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? '[]') as unknown;
    return Array.isArray(value) ? value as LocalAccount[] : [];
  } catch { return []; }
};

const hasSavedSession = () => {
  const email = localStorage.getItem(SESSION_KEY);
  return Boolean(email && (email === TEMPORARY_SESSION || readAccounts().some((account) => account.email === email)));
};

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const hashPassword = async (password: string, salt: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 180_000 }, key, 256);
  return toHex(new Uint8Array(bits));
};

export const signOutLocalAccount = () => {
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event('faithstream:logged-out'));
};

export const updateLocalAccountName = (name: string) => {
  const email = localStorage.getItem(SESSION_KEY);
  if (!email) return;
  const accounts = readAccounts();
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts.map((account) => account.email === email ? { ...account, name } : account)));
};

export default function AuthGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(hasSavedSession);
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [startingUp, setStartingUp] = useState(hasSavedSession);

  useEffect(() => {
    const onSignOut = () => {
      void requestWindowMode(false).finally(() => {
        setSignedIn(false);
        setStartingUp(false);
        setPassword('');
        setConfirmPassword('');
      });
    };
    window.addEventListener('faithstream:logged-out', onSignOut);
    return () => window.removeEventListener('faithstream:logged-out', onSignOut);
  }, []);

  useEffect(() => {
    if (!startingUp) return;
    let cancelled = false;
    const waitForPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const minimumDisplayTime = new Promise<void>((resolve) => window.setTimeout(resolve, 3000));
    const waitForInitialResources = async () => {
      await waitForPaint();
      const fontReady = document.fonts?.ready ?? Promise.resolve();
      const studioDataReady = new Promise<void>((resolve) => {
        const readyResources = new Set<string>();
        const finish = () => {
          window.clearTimeout(timer);
          window.removeEventListener('faithstream:startup-resource-ready', onResourceReady);
          resolve();
        };
        const onResourceReady = (event: Event) => {
          readyResources.add((event as CustomEvent<string>).detail);
          if (readyResources.has('studio-media') && readyResources.has('studio-music')) finish();
        };
        const timer = window.setTimeout(finish, 8000);
        window.addEventListener('faithstream:startup-resource-ready', onResourceReady);
      });
      await Promise.all([fontReady, studioDataReady]);
      await waitForPaint();
      const imagesReady = Promise.all(Array.from(document.images, (image) => image.decode().catch(() => undefined)));
      await Promise.race([imagesReady, new Promise<void>((resolve) => window.setTimeout(resolve, 6000))]);
      await waitForPaint();
    };
    void Promise.all([minimumDisplayTime, waitForInitialResources()]).then(async () => {
      if (cancelled) return;
      await requestWindowMode(true);
      if (!cancelled) setStartingUp(false);
    });
    return () => { cancelled = true; };
  }, [startingUp]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const accounts = readAccounts();
      if (mode === 'register') {
        const cleanName = name.trim();
        if (!cleanName) { setError('Enter your name to create an account.'); return; }
        if (password.length < 8) { setError('Use a password with at least 8 characters.'); return; }
        if (password !== confirmPassword) { setError('Those passwords do not match.'); return; }
        if (accounts.some((account) => account.email === normalizedEmail)) { setError('An account with this email already exists on this device. Sign in instead.'); return; }
        const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
        const account: LocalAccount = { email: normalizedEmail, name: cleanName, salt, passwordHash: await hashPassword(password, salt) };
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...accounts, account]));
        localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: cleanName, role: 'Media Team', email: normalizedEmail }));
        window.dispatchEvent(new CustomEvent('faithstream:profile-updated', { detail: { name: cleanName, role: 'Media Team', email: normalizedEmail } }));
      } else {
        // Temporary frontend-only access until server authentication is connected.
        try { localStorage.setItem(SESSION_KEY, TEMPORARY_SESSION); } catch { /* Keep temporary access available when storage is unavailable. */ }
        navigate('/');
        setSignedIn(true);
        setStartingUp(true);
        setPassword('');
        setConfirmPassword('');
        return;
      }
      localStorage.setItem(SESSION_KEY, normalizedEmail);
      navigate('/');
      setSignedIn(true);
      setStartingUp(true);
      setPassword('');
      setConfirmPassword('');
    } catch {
      setError('Could not save your account on this device. Check available storage and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (signedIn) return <>
    <div className={startingUp ? 'invisible pointer-events-none fixed inset-0' : ''} aria-hidden={startingUp}>{children}</div>
    {startingUp && <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-studio text-center text-warm-white">
      <div className="relative h-[154px] w-72 overflow-hidden" aria-hidden="true">
        <img src={LoadingAnimation} alt="" className="absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2" style={{ width: '213.333%', height: 'auto' }} />
      </div>
      <p className="text-sm font-medium text-warm-white/75">Getting your workspace ready…</p>
      <p className="text-xs text-warm-white/40">Loading your Studio and saved resources</p>
    </div>}
  </>;

  const isRegister = mode === 'register';
  return (
    <div className="flex h-screen min-h-[620px] items-center justify-center overflow-hidden bg-panel p-0 text-warm-white">
      <div className="relative grid h-full w-full overflow-hidden bg-panel md:grid-cols-[1fr_0.92fr]">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 z-20 h-9" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
        <div className="absolute right-3 top-3 z-30 flex overflow-hidden rounded-lg border border-white/10 bg-black/20" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <button type="button" aria-label="Minimize window" onClick={() => void window.faithstreamWindow?.minimize()} className="flex h-8 w-9 items-center justify-center text-white/70 hover:bg-white/10 hover:text-white"><Minus size={13} /></button>
          <button type="button" aria-label="Maximize window" onClick={() => void window.faithstreamWindow?.toggleMaximize()} className="flex h-8 w-9 items-center justify-center text-white/70 hover:bg-white/10 hover:text-white"><Square size={11} /></button>
          <button type="button" aria-label="Close window" onClick={() => void window.faithstreamWindow?.close()} className="flex h-8 w-9 items-center justify-center text-white/70 hover:bg-red-600 hover:text-white"><X size={14} /></button>
        </div>
        <aside className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden bg-[radial-gradient(ellipse_at_20%_0%,rgba(203,135,76,.28),transparent_42%),linear-gradient(145deg,#14243A,#091521)] p-10 md:flex">
          <div className="absolute -bottom-24 -right-20 h-80 w-80 rounded-full border border-white/10" />
          <div className="absolute -bottom-10 -right-6 h-52 w-52 rounded-full border border-white/10" />
          <div className="relative flex items-center gap-3" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
            <img src={FaithStreamLogo} alt="FaithStream" className="h-14 w-auto object-contain" />
            <p className="border-l border-white/15 pl-3 text-xs text-warm-white/50">Church media,<br />made simple</p>
          </div>
          <div className="relative max-w-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[.22em] text-brand">Welcome to your workspace</p>
            <h1 className="text-4xl font-semibold leading-tight">Bring every service together.</h1>
            <p className="mt-4 text-sm leading-6 text-warm-white/60">Prepare presentations, organize scenes, and run your service from one place.</p>
          </div>
          <p className="relative text-xs text-warm-white/35">Your account is saved on this computer.</p>
        </aside>

        <section className="flex min-h-[620px] flex-col justify-center px-6 py-10 sm:px-10">
          <div className="mb-8 md:hidden">
            <img src={FaithStreamLogo} alt="FaithStream" className="h-12 w-auto object-contain" />
            <p className="mt-1 text-xs text-warm-white/50">Church media, made simple</p>
          </div>
          <div className="mb-7">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">{isRegister ? 'Get started' : 'Welcome back'}</p>
            <h2 className="mt-2 text-3xl font-bold">{isRegister ? 'Create your account' : 'Sign in'}</h2>
            <p className="mt-2 text-sm text-warm-white/55">{isRegister ? 'Set up your FaithStream workspace on this computer.' : 'Sign in to open your FaithStream workspace.'}</p>
          </div>

          <form onSubmit={(event) => { void submit(event); }} className="space-y-4">
            {isRegister && <label className="block text-xs font-medium text-warm-white/70">Your name
              <input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-navy px-3.5 py-3 text-sm text-warm-white outline-none transition placeholder:text-warm-white/30 focus:border-brand" placeholder="e.g. Alex Santos" />
            </label>}
            <label className="block text-xs font-medium text-warm-white/70">Email address
              <span className="relative mt-1.5 block"><Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-warm-white/35" /><input required={isRegister} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-white/10 bg-navy py-3 pl-10 pr-3.5 text-sm text-warm-white outline-none transition placeholder:text-warm-white/30 focus:border-brand" placeholder="you@example.com" /></span>
            </label>
            <label className="block text-xs font-medium text-warm-white/70">Password
              <span className="relative mt-1.5 block"><LockKeyhole size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-warm-white/35" /><input required={isRegister} type={showPassword ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 8 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-white/10 bg-navy py-3 pl-10 pr-11 text-sm text-warm-white outline-none transition placeholder:text-warm-white/30 focus:border-brand" placeholder={isRegister ? 'At least 8 characters' : 'Temporary sign-in: no password needed'} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-white/45 hover:text-warm-white">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>
            </label>
            {isRegister && <label className="block text-xs font-medium text-warm-white/70">Confirm password
              <input required type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-navy px-3.5 py-3 text-sm text-warm-white outline-none transition placeholder:text-warm-white/30 focus:border-brand" placeholder="Enter the password again" />
            </label>}
            {error && <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-xs leading-relaxed text-red-200">{error}</p>}
            <button disabled={busy} type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-navy transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">{busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'} {!busy && <ArrowRight size={16} />}</button>
          </form>

          <p className="mt-6 text-center text-sm text-warm-white/55">{isRegister ? 'Already have an account?' : 'New to FaithStream?'}{' '}
            <button type="button" onClick={() => { setError(''); setMode(isRegister ? 'login' : 'register'); }} className="font-semibold text-brand hover:underline">{isRegister ? 'Sign in' : 'Create account'}</button>
          </p>
          <p className="mt-7 text-center text-[11px] leading-relaxed text-warm-white/35">{isRegister ? 'Accounts are stored on this computer for now. Online accounts will be connected when the FaithStream backend is ready.' : 'Temporary sign-in is enabled while online accounts are being prepared.'}</p>
        </section>
      </div>
    </div>
  );
}
