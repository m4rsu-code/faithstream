import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { API_BASE, errorMessage } from '../utils/api';
import { useAdminAuth } from '../context/AdminAuthProvider';
import FaithStreamLogo from '../../../desktop/src/assets/img/Logo.png';

interface LoginLocationState {
  message?: string;
}

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {visible ? <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></> : <><path d="m3 3 18 18" /><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a15.7 15.7 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.3 0 2.5-.3 3.5-.8" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>}
    </svg>
  );
}

export default function LoginPage() {
  const { isAuthenticated, login } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as LoginLocationState | null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState(locationState?.message || '');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      await login(email, password);
      navigate('/overview', { replace: true });
    } catch (loginError) {
      setError(errorMessage(loginError));
    } finally {
      setBusy(false);
    }
  }

  if (isAuthenticated) {
    return <Navigate to="/overview" replace />;
  }

  return (
    <main className="login-screen min-h-screen grid">
      <section className="login-card">
        <div className="brand-lockup login-brand"><img className="brand-logo" src={FaithStreamLogo} alt="FaithStream Studio" /><small>ADMIN</small></div>
        <p className="eyebrow">PRIVATE ADMIN CONSOLE</p>
        <h1>Good to have you<br /><em>back.</em></h1>
        <p className="login-copy">Sign in with your FaithStream Studio administrator account to view service activity.</p>
        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <label htmlFor="email">Email address</label>
          <input id="email" type="email" autoComplete="username" placeholder="admin@gmail.com" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="password">Password</label>
          <div className="admin-password-field"><input id="password" type={passwordVisible ? 'text' : 'password'} autoComplete="current-password" placeholder="Your account password" required value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? 'Hide password' : 'Show password'} aria-pressed={passwordVisible}><PasswordVisibilityIcon visible={passwordVisible} /></button></div>
          <p className="form-error" role="alert">{error}</p>
          <button className="button button-primary" type="submit" disabled={busy}><span>{busy ? 'Signing in…' : 'Sign in securely'}</span><span aria-hidden="true">→</span></button>
        </form>
        <p className="login-foot"><span className="lock-mark">◆</span> Access is restricted to authorized administrators.</p>
      </section>
      <aside className="login-art">
        <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-cross">✳</div>
        <div className="art-copy"><img className="faithstream-hero-logo" src={FaithStreamLogo} alt="FaithStream Studio" /><span>FAITHSTREAM STUDIO</span><h2>Clear insight<br />for a <em>steadier</em><br />service.</h2><p>One private place to understand what’s happening across your platform.</p></div>
        <div className="art-bottom"><span>OPERATIONS OVERVIEW</span><span>01 — PRIVATE</span></div>
      </aside>
    </main>
  );
}
