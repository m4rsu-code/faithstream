import { useEffect, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Minus, Square, X } from 'lucide-react';
import FaithStreamLogo from '../assets/img/Logo.png';
import LoadingAnimation from '../assets/img/loading.gif';

const LEGACY_TOKEN_KEY = 'faithstream.api-token';
const PROFILE_KEY = 'faithstream.user-profile';
const API_BASE_URL = ((import.meta as ImportMeta & { env: { VITE_FAITHSTREAM_API_URL?: string } }).env.VITE_FAITHSTREAM_API_URL ?? 'http://127.0.0.1:8000/api').replace(/\/$/, '');
const AUTH_THEME_STYLE = {
  '--color-brand': '#CB874C',
  '--color-navy': '#14243A',
  '--color-studio': '#101923',
  '--color-panel': '#192431',
  '--color-warm-white': '#F7F5F0',
  colorScheme: 'dark',
} as CSSProperties;

const requestWindowMode = async (authenticated: boolean) => {
  try {
    const handled = await window.faithstreamWindow?.setAuthenticatedMode(authenticated);
    if (handled) return;
  } catch { /* Fall back to the basic presentation window control. */ }
  try {
    await window.faithstreamWindow?.setPresentationFullscreen(authenticated);
  } catch { /* Keep sign-in and sign-out available if window controls are unavailable. */ }
};

type AuthMode = 'login' | 'register' | 'forgot';

const getStoredAuthToken = async () => {
  const bridge = window.faithstreamWindow;
  if (!bridge) return null;
  const encryptedToken = await bridge.getAuthToken();
  if (encryptedToken) {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    return encryptedToken;
  }

  const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (!legacyToken) return null;
  const stored = await bridge.saveAuthToken(legacyToken);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  return stored ? legacyToken : null;
};

const saveStoredAuthToken = async (token: string) => {
  const stored = await window.faithstreamWindow?.saveAuthToken(token);
  if (!stored) throw new Error('Secure sign-in storage is unavailable. Restart FaithStream and try again.');
  localStorage.removeItem(LEGACY_TOKEN_KEY);
};

const clearStoredAuthToken = async () => {
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  await window.faithstreamWindow?.clearAuthToken();
};

type ProfilePhotoPosition = { x: number; y: number };
type ApiUser = { id: number; name: string; email_address: string; role: string; profile_photo_url: string | null; profile_photo_position: ProfilePhotoPosition };
const MIN_PROFILE_SAVE_LOADING_MS = 3000;

const waitForMinimumProfileSaveLoading = async (startedAt: number) => {
  const remaining = MIN_PROFILE_SAVE_LOADING_MS - (Date.now() - startedAt);
  if (remaining > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
};

const saveUserProfile = (user: ApiUser) => {
  const profile = {
    name: user.name,
    role: user.role,
    email: user.email_address,
    photoUrl: user.profile_photo_url ? new URL(user.profile_photo_url, `${API_BASE_URL}/`).toString() : null,
    photoPosition: user.profile_photo_position ?? { x: 50, y: 50 },
  };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new CustomEvent('faithstream:profile-updated', { detail: profile }));
};

export const signOutLocalAccount = () => {
  void (async () => {
    const token = await getStoredAuthToken().catch(() => null);
    if (token) void fetch(`${API_BASE_URL}/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }).catch(() => undefined);
    await clearStoredAuthToken().catch(() => undefined);
    window.dispatchEvent(new Event('faithstream:logged-out'));
  })();
};

export const updateLocalAccountProfile = async (name: string, role: string): Promise<ApiUser> => {
  const startedAt = Date.now();
  try {
    const token = await getStoredAuthToken();
    if (!token) throw new Error('You must be signed in to update your profile.');
    const response = await fetch(`${API_BASE_URL}/user`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name, role }),
    });
    const data = await response.json() as { user?: ApiUser; message?: string; errors?: Record<string, string[]> };
    if (!response.ok || !data.user) {
      const firstError = data.errors ? Object.values(data.errors).flat()[0] : undefined;
      throw new Error(firstError ?? data.message ?? 'Could not save your profile.');
    }
    await waitForMinimumProfileSaveLoading(startedAt);
    saveUserProfile(data.user);
    return data.user;
  } catch (error) {
    await waitForMinimumProfileSaveLoading(startedAt);
    throw error;
  }
};

export const updateLocalAccountProfilePhoto = async (photo: File): Promise<ApiUser> => {
  const token = await getStoredAuthToken();
  if (!token) throw new Error('You must be signed in to update your profile photo.');
  const form = new FormData();
  form.append('photo', photo);
  const response = await fetch(`${API_BASE_URL}/user/profile-photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body: form,
  });
  const data = await response.json() as { user?: ApiUser; message?: string; errors?: Record<string, string[]> };
  if (!response.ok || !data.user) {
    const firstError = data.errors ? Object.values(data.errors).flat()[0] : undefined;
    throw new Error(firstError ?? data.message ?? 'Could not save your profile photo.');
  }
  saveUserProfile(data.user);
  return data.user;
};

export const removeLocalAccountProfilePhoto = async (): Promise<ApiUser> => {
  const token = await getStoredAuthToken();
  if (!token) throw new Error('You must be signed in to update your profile photo.');
  const response = await fetch(`${API_BASE_URL}/user/profile-photo`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const data = await response.json() as { user?: ApiUser; message?: string };
  if (!response.ok || !data.user) throw new Error(data.message ?? 'Could not remove your profile photo.');
  saveUserProfile(data.user);
  return data.user;
};

export const updateLocalAccountProfilePhotoPosition = async (position: ProfilePhotoPosition): Promise<ApiUser> => {
  const token = await getStoredAuthToken();
  if (!token) throw new Error('You must be signed in to adjust your profile photo.');
  const response = await fetch(`${API_BASE_URL}/user/profile-photo/position`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(position),
  });
  const data = await response.json() as { user?: ApiUser; message?: string; errors?: Record<string, string[]> };
  if (!response.ok || !data.user) {
    const firstError = data.errors ? Object.values(data.errors).flat()[0] : undefined;
    throw new Error(firstError ?? data.message ?? 'Could not save your profile photo position.');
  }
  saveUserProfile(data.user);
  return data.user;
};

export default function AuthGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [canResendVerification, setCanResendVerification] = useState(false);
  const [busy, setBusy] = useState(false);
  const [startingUp, setStartingUp] = useState(false);

  const switchAuthMode = (nextMode: AuthMode) => {
    setError('');
    setNotice('');
    setCanResendVerification(false);
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setMode(nextMode);
  };

  useEffect(() => {
    const onSignOut = () => {
      void requestWindowMode(false).finally(() => {
        setSignedIn(false);
        setStartingUp(false);
        setMode('login');
        setName('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setShowPassword(false);
        setShowConfirmPassword(false);
        setError('');
        setNotice('');
        setCanResendVerification(false);
      });
    };
    window.addEventListener('faithstream:logged-out', onSignOut);
    return () => window.removeEventListener('faithstream:logged-out', onSignOut);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const restoreSession = async () => {
      try {
        const token = await getStoredAuthToken();
        if (!token) return;
        try {
          const response = await fetch(`${API_BASE_URL}/user`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
          if (response.status === 401 || response.status === 403) {
            await clearStoredAuthToken();
            return;
          }
          if (response.ok) {
            const data = await response.json() as { user: ApiUser };
            saveUserProfile(data.user);
          }
        } catch { /* Preserve the encrypted local token when the API is temporarily unreachable. */ }
        if (!cancelled) {
          setSignedIn(true);
          setStartingUp(true);
        }
      } catch { /* If secure storage cannot be read, show the sign-in screen. */ }
      finally {
        if (!cancelled) setCheckingSession(false);
      }
    };
    void restoreSession();
    return () => { cancelled = true; };
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

  const resendVerification = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!/^[^@\s]+@gmail\.com$/.test(normalizedEmail)) {
        setError('Enter the Gmail address you used to register.');
        return;
      }
      const response = await fetch(`${API_BASE_URL}/email/verification-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email_address: normalizedEmail }),
      });
      const data = await response.json() as { message?: string; errors?: Record<string, string[]> };
      if (!response.ok) {
        const firstError = data.errors ? Object.values(data.errors).flat()[0] : undefined;
        throw new Error(firstError ?? data.message ?? 'Could not resend the verification link. Try again.');
      }
      setNotice(data.message ?? 'If that Gmail address has an unverified account, a new verification link has been sent.');
      setCanResendVerification(false);
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== 'Failed to fetch'
        ? cause.message
        : 'Cannot reach the FaithStream server. Start the Laravel backend and try again.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setCanResendVerification(false);
    setBusy(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!/^[^@\s]+@gmail\.com$/.test(normalizedEmail)) {
        setError('Use a Google Gmail address ending in @gmail.com.');
        return;
      }

      if (mode === 'forgot') {
        const response = await fetch(`${API_BASE_URL}/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ email_address: normalizedEmail }),
        });
        const data = await response.json() as { message?: string; errors?: Record<string, string[]> };
        if (!response.ok) {
          const firstError = data.errors ? Object.values(data.errors).flat()[0] : undefined;
          throw new Error(firstError ?? data.message ?? 'Could not request a password reset. Try again.');
        }
        setNotice(data.message ?? 'If an account exists for that Gmail address, a password reset link has been sent.');
        return;
      }

      const payload: Record<string, string> = { email_address: normalizedEmail, password };
      if (mode === 'register') {
        const cleanName = name.trim();
        if (!cleanName) { setError('Enter your name to create an account.'); return; }
        if (password.length < 12) { setError('Use a password with at least 12 characters.'); return; }
        if (password !== confirmPassword) { setError('Those passwords do not match.'); return; }
        payload.name = cleanName;
        payload.confirm_password = confirmPassword;
      }

      const response = await fetch(`${API_BASE_URL}/${mode === 'register' ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json() as { user?: ApiUser; token?: string; message?: string; verification_required?: boolean; errors?: Record<string, string[]> };
      if (mode === 'register' && response.ok && data.verification_required) {
        setMode('login');
        setName('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setNotice(data.message ?? 'Account created. Check your Gmail inbox for a verification link before signing in.');
        return;
      }
      if (!response.ok || !data.user || !data.token) {
        if (data.verification_required) setCanResendVerification(true);
        const firstError = data.errors ? Object.values(data.errors).flat()[0] : undefined;
        throw new Error(firstError ?? data.message ?? 'Could not sign in. Check your details and try again.');
      }

      await saveStoredAuthToken(data.token);
      saveUserProfile(data.user);
      navigate('/');
      setSignedIn(true);
      setStartingUp(true);
      setPassword('');
      setConfirmPassword('');
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== 'Failed to fetch'
        ? cause.message
        : 'Cannot reach the FaithStream server. Start the Laravel backend and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (checkingSession) return <div style={AUTH_THEME_STYLE} className="flex h-screen items-center justify-center bg-panel text-sm text-warm-white/60">Checking your account…</div>;

  if (signedIn) return <>
    <div className={startingUp ? 'invisible pointer-events-none fixed inset-0' : ''} aria-hidden={startingUp}>{children}</div>
    {startingUp && <div style={AUTH_THEME_STYLE} className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-studio text-center text-warm-white">
      <div className="relative h-[154px] w-72 overflow-hidden" aria-hidden="true">
        <img src={LoadingAnimation} alt="" className="absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2" style={{ width: '213.333%', height: 'auto' }} />
      </div>
      <p className="text-sm font-medium text-warm-white/75">Getting your workspace ready…</p>
      <p className="text-xs text-warm-white/40">Loading your Studio and saved resources</p>
    </div>}
  </>;

  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';
  return (
    <div style={AUTH_THEME_STYLE} className="flex h-screen min-h-[620px] items-center justify-center overflow-hidden bg-panel p-0 text-warm-white">
      <div className="relative grid h-full w-full overflow-hidden bg-panel md:grid-cols-[1fr_0.92fr]">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 z-20 h-9" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
        <div className="absolute right-3 top-3 z-30 flex overflow-hidden rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.2)]" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <button type="button" aria-label="Minimize window" onClick={() => void window.faithstreamWindow?.minimize()} className="flex h-8 w-9 items-center justify-center text-warm-white/70 hover:bg-white/10 hover:text-warm-white"><Minus size={13} /></button>
          <button type="button" aria-label="Maximize window" onClick={() => void window.faithstreamWindow?.toggleMaximize()} className="flex h-8 w-9 items-center justify-center text-warm-white/70 hover:bg-white/10 hover:text-warm-white"><Square size={11} /></button>
          <button type="button" aria-label="Close window" onClick={() => void window.faithstreamWindow?.close()} className="flex h-8 w-9 items-center justify-center text-warm-white/70 hover:bg-red-600 hover:text-warm-white"><X size={14} /></button>
        </div>
        <aside className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden bg-[radial-gradient(ellipse_at_20%_0%,rgba(203,135,76,.28),transparent_42%),linear-gradient(145deg,#14243A,#091521)] p-10 md:flex">
          <div className="absolute -bottom-24 -right-20 h-80 w-80 rounded-full border border-[rgba(255,255,255,0.1)]" />
          <div className="absolute -bottom-10 -right-6 h-52 w-52 rounded-full border border-[rgba(255,255,255,0.1)]" />
          <div className="relative flex items-center gap-3" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
            <img src={FaithStreamLogo} alt="FaithStream" className="h-14 w-auto object-contain" />
            <p className="border-l border-[rgba(255,255,255,0.15)] pl-3 text-xs text-warm-white/50">Church media,<br />made simple</p>
          </div>
          <div className="relative max-w-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[.22em] text-brand">Welcome to your workspace</p>
            <h1 className="text-4xl font-semibold leading-tight">Bring every service together.</h1>
            <p className="mt-4 text-sm leading-6 text-warm-white/60">Prepare presentations, organize scenes, and run your service from one place.</p>
          </div>
          <p className="relative text-xs text-warm-white/35">Your account is protected by a password.</p>
        </aside>

        <section className="flex min-h-[620px] flex-col justify-center px-6 py-10 sm:px-10">
          <div className="mb-8 md:hidden">
            <img src={FaithStreamLogo} alt="FaithStream" className="h-12 w-auto object-contain" />
            <p className="mt-1 text-xs text-warm-white/50">Church media, made simple</p>
          </div>
          <div className="mb-7">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">{isRegister ? 'Get started' : isForgot ? 'Account recovery' : 'Welcome back'}</p>
            <h2 className="mt-2 text-3xl font-bold">{isRegister ? 'Create your account' : isForgot ? 'Forgot password?' : 'Sign in'}</h2>
            <p className="mt-2 text-sm text-warm-white/55">{isRegister ? 'Create an account with your Gmail address.' : isForgot ? 'Enter your Gmail address and we’ll email you a password reset link.' : 'Sign in to your FaithStream account.'}</p>
          </div>

          <form onSubmit={(event) => { void submit(event); }} className="space-y-4">
            {isRegister && <label className="block text-xs font-medium text-warm-white/70">Your name
              <input name="name" required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[rgba(255,255,255,0.1)] bg-navy px-3.5 py-3 text-sm text-warm-white outline-none transition placeholder:text-warm-white/30 focus:border-brand" placeholder="e.g. Alex Santos" />
            </label>}
            <label className="block text-xs font-medium text-warm-white/70">Gmail address
              <span className="relative mt-1.5 block"><Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-warm-white/35" /><input name="email_address" required type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setCanResendVerification(false); }} className="w-full rounded-xl border border-[rgba(255,255,255,0.1)] bg-navy py-3 pl-10 pr-3.5 text-sm text-warm-white outline-none transition placeholder:text-warm-white/30 focus:border-brand" placeholder="you@gmail.com" /></span>
            </label>
            {!isForgot && <label className="block text-xs font-medium text-warm-white/70">Password
              <span className="relative mt-1.5 block"><LockKeyhole size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-warm-white/35" /><input name="password" required type={showPassword ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 12 : undefined} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-[rgba(255,255,255,0.1)] bg-navy py-3 pl-10 pr-11 text-sm text-warm-white outline-none transition placeholder:text-warm-white/30 focus:border-brand" placeholder={isRegister ? 'At least 12 characters' : 'Your password'} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-white/45 hover:text-warm-white">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>
            </label>}
            {!isRegister && !isForgot && <div className="-mt-2 text-right"><button type="button" onClick={() => { setError(''); setNotice(''); setMode('forgot'); }} className="text-xs font-semibold text-brand hover:underline">Forgot password?</button></div>}
            {isRegister && <label className="block text-xs font-medium text-warm-white/70">Confirm password
              <span className="relative mt-1.5 block"><LockKeyhole size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-warm-white/35" /><input name="confirm_password" required type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full rounded-xl border border-[rgba(255,255,255,0.1)] bg-navy py-3 pl-10 pr-11 text-sm text-warm-white outline-none transition placeholder:text-warm-white/30 focus:border-brand" placeholder="Enter the password again" /><button type="button" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-white/45 hover:text-warm-white">{showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>
            </label>}
            {error && <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-xs leading-relaxed [color:#fecaca]">{error}</p>}
            {canResendVerification && !isRegister && !isForgot && <button disabled={busy} type="button" onClick={() => { void resendVerification(); }} className="w-full text-center text-xs font-semibold text-brand hover:underline disabled:opacity-60">Resend verification link</button>}
            {notice && <p role="status" className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2.5 text-xs leading-relaxed [color:#6ee7b7]">{notice}</p>}
            <button disabled={busy} type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-navy transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">{busy ? 'Please wait…' : isRegister ? 'Create account' : isForgot ? 'Send reset link' : 'Sign in'} {!busy && <ArrowRight size={16} />}</button>
          </form>

          <p className="mt-6 text-center text-sm text-warm-white/55">{isForgot ? 'Remember your password?' : isRegister ? 'Already have an account?' : 'New to FaithStream?'}{' '}
            <button type="button" onClick={() => switchAuthMode(isRegister || isForgot ? 'login' : 'register')} className="font-semibold text-brand hover:underline">{isRegister || isForgot ? 'Sign in' : 'Create account'}</button>
          </p>
          <p className="mt-7 text-center text-[11px] leading-relaxed text-warm-white/35">Accounts are stored securely on the FaithStream server. Gmail addresses only.</p>
        </section>
      </div>
    </div>
  );
}
