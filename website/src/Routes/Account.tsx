import { useEffect, useState, type FormEvent } from 'react'
import Icon from '../components/Icon'
import { API_BASE, clearWebsiteSession, getWebsiteToken, getWebsiteUser, PAYMENT_STATUS_EVENT, saveWebsiteSession, WEBSITE_ACCOUNT_EVENT, type WebsiteUser } from '../utils/account'

type AuthMode = 'login' | 'register' | 'forgot'

interface PaymentStatus {
  license_active: boolean
  license_activated_at: string | null
  payment_request: null | {
    id: number
    status: 'pending' | 'approved' | 'rejected'
    payment_method: string
    submitted_at: string | null
    reviewed_at: string | null
    admin_note: string | null
  }
}

interface ApiResponse {
  [key: string]: unknown
}

async function responseJson(response: Response): Promise<ApiResponse> {
  try {
    const data: unknown = await response.json()
    return typeof data === 'object' && data !== null && !Array.isArray(data)
      ? data as ApiResponse
      : {}
  } catch {
    return { message: `The FaithStream Studio server returned an error (${response.status}). Please try again.` }
  }
}

function firstError(data: ApiResponse): string | null {
  const errors = data.errors
  if (typeof errors === 'object' && errors !== null && !Array.isArray(errors)) {
    for (const value of Object.values(errors)) {
      const message = Array.isArray(value) ? value[0] : value
      if (typeof message === 'string') return message
    }
  }
  return null
}

function responseMessage(data: ApiResponse, fallback: string): string {
  return typeof data.message === 'string' ? data.message : fallback
}

function isPaymentStatus(data: ApiResponse): data is ApiResponse & PaymentStatus {
  if (typeof data.license_active !== 'boolean') return false
  if (data.license_activated_at !== null && typeof data.license_activated_at !== 'string') return false
  if (data.payment_request === null) return true

  const request = data.payment_request
  if (typeof request !== 'object' || request === null || Array.isArray(request)) return false
  const paymentRequest = request as Record<string, unknown>
  return typeof paymentRequest.id === 'number'
    && (paymentRequest.status === 'pending' || paymentRequest.status === 'approved' || paymentRequest.status === 'rejected')
    && typeof paymentRequest.payment_method === 'string'
    && (paymentRequest.submitted_at === null || typeof paymentRequest.submitted_at === 'string')
    && (paymentRequest.reviewed_at === null || typeof paymentRequest.reviewed_at === 'string')
    && (paymentRequest.admin_note === null || typeof paymentRequest.admin_note === 'string')
}

function formatDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
}

export default function Account() {
  const search = new URLSearchParams(window.location.search)
  const [mode, setMode] = useState<AuthMode>(search.get('mode') === 'register' ? 'register' : 'login')
  const [user, setUser] = useState<WebsiteUser | null>(() => getWebsiteUser())
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null)
  const [checkingAccount, setCheckingAccount] = useState(() => Boolean(getWebsiteToken()))
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [canResendVerification, setCanResendVerification] = useState(false)

  async function refreshPaymentStatus(token = getWebsiteToken()) {
    if (!token) {
      setPaymentStatus(null)
      return
    }
    try {
      const response = await fetch(`${API_BASE}/license/payment-status`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const data = await responseJson(response)
      if (response.ok && isPaymentStatus(data)) setPaymentStatus(data)
    } catch {
      /* Keep the last payment status visible during a temporary connection issue. */
    }
  }

  useEffect(() => {
    let active = true
    const token = getWebsiteToken()
    if (!token) return

    fetch(`${API_BASE}/website/account`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
      .then(async (response) => {
        const data = await responseJson(response)
        if (!response.ok || !data.user) {
          if (response.status === 401 || response.status === 403) {
            clearWebsiteSession()
            if (active) {
              setUser(null)
              setNotice('Your website sign-in has expired. Please sign in again.')
            }
          } else if (active) {
            setNotice('Your account could not be refreshed. You can retry shortly; your current sign-in remains available.')
          }
          return
        }
        if (active) {
          const accountUser = data.user as WebsiteUser
          setUser(accountUser)
          saveWebsiteSession(token, accountUser)
          await refreshPaymentStatus(token)
        }
      })
      .catch(() => {
        if (active) setNotice('Your account could not be refreshed. Check your connection and retry shortly.')
      })
      .finally(() => {
        if (active) setCheckingAccount(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const syncAccount = () => setUser(getWebsiteUser())
    const syncPayment = () => { void refreshPaymentStatus() }

    window.addEventListener(WEBSITE_ACCOUNT_EVENT, syncAccount)
    window.addEventListener(PAYMENT_STATUS_EVENT, syncPayment)

    return () => {
      window.removeEventListener(WEBSITE_ACCOUNT_EVENT, syncAccount)
      window.removeEventListener(PAYMENT_STATUS_EVENT, syncPayment)
    }
  }, [])

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setError('')
    setNotice('')
    setCanResendVerification(false)
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirmPassword(false)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    setCanResendVerification(false)

    if (mode === 'register' && password !== confirmPassword) {
      setError('The password confirmation does not match.')
      return
    }

    setBusy(true)
    const submitStartedAt = Date.now()
    const endpoint = mode === 'forgot' ? '/forgot-password' : mode === 'register' ? '/register' : '/login'
    const payload: Record<string, string> = { email_address: email.trim().toLowerCase() }

    if (mode === 'register') {
      payload.name = name.trim()
      payload.password = password
      payload.confirm_password = confirmPassword
    } else if (mode === 'login') {
      payload.password = password
      payload.client = 'website'
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await responseJson(response)

      if (!response.ok) {
        if (data.verification_required) setCanResendVerification(true)
        throw new Error(firstError(data) || responseMessage(data, 'Could not complete the request. Please try again.'))
      }

      if (mode === 'register') {
        switchMode('login')
        setEmail(payload.email_address)
        setNotice(responseMessage(data, 'Account created. Check your Gmail inbox and verify your email before signing in.'))
        return
      }

      if (mode === 'forgot') {
        setNotice(responseMessage(data, 'If an account exists for that Gmail address, a password reset link has been sent.'))
        return
      }

      if (typeof data.token !== 'string' || !data.user) {
        throw new Error('The server did not return a sign-in session. Please try again.')
      }

      const remainingLoadingTime = 3000 - (Date.now() - submitStartedAt)
      if (remainingLoadingTime > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingLoadingTime))
      }

      const accountUser = data.user as WebsiteUser
      saveWebsiteSession(data.token, accountUser)
      setUser(accountUser)
      setPassword('')
      await refreshPaymentStatus(data.token)
    } catch (submitError) {
      setError(
        submitError instanceof Error && submitError.message !== 'Failed to fetch'
          ? submitError.message
          : 'Cannot reach the FaithStream Studio server. Please try again in a moment.'
      )
    } finally {
      setBusy(false)
    }
  }

  async function resendVerification() {
    setBusy(true)
    setError('')
    setNotice('')

    try {
      const response = await fetch(`${API_BASE}/email/verification-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email_address: email.trim().toLowerCase() }),
      })
      const data = await responseJson(response)

      if (!response.ok) {
        throw new Error(firstError(data) || responseMessage(data, 'Could not resend the verification email.'))
      }

      setNotice(responseMessage(data, 'If the account is unverified, a new verification link has been sent.'))
      setCanResendVerification(false)
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'Could not resend the verification email.')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    const token = getWebsiteToken()
    if (token) {
      try {
        await fetch(`${API_BASE}/logout`, {
          method: 'POST',
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        })
      } catch {
        /* Clear the website session even if the API is temporarily unreachable. */
      }
    }
    clearWebsiteSession()
    setUser(null)
    setPaymentStatus(null)
    setMode('login')
    setNotice('You have been signed out of the FaithStream Studio website.')
  }

  if (checkingAccount) {
    return (
      <section className="inner-page account-page">
        <div className="account-shell">
          <div className="account-card account-loading">Checking your FaithStream Studio account…</div>
        </div>
      </section>
    )
  }

  return (
    <section className="inner-page account-page">
      <div className="account-glow" />
      <div className="account-shell">
        
        {/* Intro Section */}
        <div className="account-intro">
          <div className="eyebrow">
            <span className="eyebrow-line" /> FAITHSTREAM STUDIO ACCOUNT
          </div>
          <h1>
            One account for<br />
            <em>your whole workspace.</em>
          </h1>
          <p>
            Use the same verified Gmail and password on the website and in the FaithStream Studio desktop app. Sign in here to submit and track license payment proof.
          </p>
          <div className="account-free-note">
            <span className="status-dot" />
            <span>FaithStream Studio is free for at least the first three months. No payment is required during the launch period.</span>
          </div>
        </div>

        {user ? (
          /* User Dashboard View */
          <section className="account-card account-dashboard" aria-labelledby="account-welcome">
            <div className="account-card-header">
              <div>
                <span className="account-kicker">SIGNED IN</span>
                <h2 id="account-welcome">Welcome, {user.name}</h2>
                <p>{user.email_address}</p>
              </div>
              <button type="button" className="account-signout" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>

            <div className="account-status-card">
              <div>
                <span className={`account-status-dot ${paymentStatus?.license_active ? 'is-active' : ''}`} />
                <div>
                  <strong>
                    {paymentStatus?.license_active
                      ? 'One-time license active'
                      : paymentStatus?.payment_request?.status === 'pending'
                      ? 'Payment proof under review'
                      : paymentStatus?.payment_request?.status === 'rejected'
                      ? 'Payment proof needs attention'
                      : 'Free launch access'}
                  </strong>
                  <small>
                    {paymentStatus?.license_active
                      ? `Activated ${formatDate(paymentStatus.license_activated_at)}`
                      : paymentStatus?.payment_request?.status === 'pending'
                      ? 'Your payment is awaiting manual verification.'
                      : paymentStatus?.payment_request?.status === 'rejected'
                      ? paymentStatus.payment_request.admin_note || 'Review the rejection notice before submitting a new receipt.'
                      : 'FaithStream Studio is free during the launch period. No license is needed right now.'}
                  </small>
                </div>
              </div>
              <a className="account-status-link" href="/plans">
                View pricing &amp; payment information <Icon name="arrow" size={15} />
              </a>
            </div>

            {paymentStatus?.payment_request && (
              <div className="account-request-details">
                <span>Latest payment request</span>
                <strong>#{paymentStatus.payment_request.id} · {paymentStatus.payment_request.status}</strong>
                <small>
                  Submitted {formatDate(paymentStatus.payment_request.submitted_at)}
                  {paymentStatus.payment_request.reviewed_at ? ` · Reviewed ${formatDate(paymentStatus.payment_request.reviewed_at)}` : ''}
                </small>
              </div>
            )}

            <p className="account-session-note">
              This website sign-in is separate from your desktop session. Sign out here when using a shared computer.
            </p>
          </section>
        ) : (
          /* Authentication / Form View */
          <section className="account-card" aria-labelledby="account-form-title">
            <div className="account-card-header">
              <div>
                <span className="account-kicker">
                  {mode === 'register' ? 'NEW ACCOUNT' : mode === 'forgot' ? 'ACCOUNT RECOVERY' : 'WELCOME BACK'}
                </span>
                <h2 id="account-form-title">
                  {mode === 'register' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Sign in'}
                </h2>
                <p>
                  {mode === 'register'
                    ? 'Create one account for the website and desktop app.'
                    : mode === 'forgot'
                    ? 'We’ll email a secure password reset link.'
                    : 'Use your FaithStream Studio desktop account.'}
                </p>
              </div>
            </div>

            <form className="account-form" onSubmit={(event) => void submit(event)}>
              {mode === 'register' && (
                <label>
                  Your name
                  <input
                    type="text"
                    autoComplete="name"
                    required
                    maxLength={255}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Alex Santos"
                  />
                </label>
              )}

              <label>
                Gmail address
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setCanResendVerification(false)
                  }}
                  placeholder="you@gmail.com"
                />
              </label>

              {mode !== 'forgot' && (
                <label>
                  Password
                  <div className="account-password-input">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                      required
                      minLength={mode === 'register' ? 12 : undefined}
                      maxLength={128}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={mode === 'register' ? 'At least 12 characters' : 'Your password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
              )}

              {mode === 'register' && (
                <label>
                  Confirm password
                  <div className="account-password-input">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={128}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Enter the password again"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((value) => !value)}
                      aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                    >
                      {showConfirmPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
              )}

              {mode === 'login' && (
                <button className="account-text-button account-forgot" type="button" onClick={() => switchMode('forgot')}>
                  Forgot password?
                </button>
              )}

              {error && (
                <p className="account-alert account-alert-error" role="alert">
                  {error}
                </p>
              )}

              {notice && (
                <p className="account-alert account-alert-success" role="status">
                  {notice}
                </p>
              )}

              {canResendVerification && (
                <button className="account-text-button" type="button" disabled={busy} onClick={() => void resendVerification()}>
                  Resend verification email
                </button>
              )}

              <button className="button button-primary account-submit" type="submit" disabled={busy}>
                {busy ? (
                  <>
                    <span className="account-spinner" aria-hidden="true" />
                    {mode === 'login' ? 'Signing in…' : 'Please wait…'}
                  </>
                ) : mode === 'register' ? (
                  'Create account'
                ) : mode === 'forgot' ? (
                  'Send reset link'
                ) : (
                  'Sign in'
                )}{' '}
                {!busy && <Icon name="arrow" size={16} />}
              </button>
            </form>

            <p className="account-mode-switch">
              {mode === 'register' ? 'Already have an account?' : mode === 'forgot' ? 'Remember your password?' : 'New to FaithStream Studio?'}{' '}
              <button
                className="account-text-button"
                type="button"
                onClick={() => switchMode(mode === 'register' || mode === 'forgot' ? 'login' : 'register')}
              >
                {mode === 'register' || mode === 'forgot' ? 'Sign in' : 'Create account'}
              </button>
            </p>

            <p className="account-security-note">
              Gmail addresses only. Passwords are handled by the FaithStream Studio server and are never stored in this browser.
            </p>
          </section>
        )}
      </div>
    </section>
  )
}
