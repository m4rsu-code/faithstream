import { useEffect, useState } from 'react'
import Icon from './Icon'
import { API_BASE, clearWebsiteSession, getWebsiteToken, getWebsiteUser, WEBSITE_ACCOUNT_EVENT, type WebsiteUser } from '../utils/account'

export default function Navbar({ currentPath }: { currentPath: string }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [account, setAccount] = useState<WebsiteUser | null>(() => getWebsiteUser())

  useEffect(() => {
    const syncAccount = () => setAccount(getWebsiteUser())
    window.addEventListener(WEBSITE_ACCOUNT_EVENT, syncAccount)
    return () => window.removeEventListener(WEBSITE_ACCOUNT_EVENT, syncAccount)
  }, [])

  async function signOut() {
    const token = getWebsiteToken()
    if (token) {
      try {
        await fetch(`${API_BASE}/logout`, {
          method: 'POST',
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        })
      } catch {
        /* Sign out locally even if the API is temporarily unavailable. */
      }
    }
    clearWebsiteSession()
    setMenuOpen(false)
  }

  const links = [
    { label: 'Platform', href: '/#platform' },
    { label: 'How it works', href: '/#how-it-works' },
    { label: 'Watch', href: '/#watch' },
    { label: 'Pricing', href: '/plans', active: currentPath === '/plans' },
  ]

  return (
    <header className="site-header">
      <div className="nav-shell">
        {/* Brand Logo */}
        <a className="brand" href="/" aria-label="FaithStream Studio home">
          <img src="/faithstream-logo.png" alt="FaithStream Studio" />
        </a>

        {/* Mobile Menu Toggle */}
        <button
          className="mobile-menu-button"
          type="button"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Icon name={menuOpen ? 'close' : 'menu'} size={21} />
        </button>

        {/* Navigation Links */}
        <nav className={`main-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation">
          {links.map((link) => (
            <a
              key={link.label}
              className={link.active ? 'active' : ''}
              href={link.href}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}

          {account ? (
            <div className="nav-account-group">
              <a
                className={`nav-account-link ${currentPath === '/account' ? 'active' : ''}`}
                href="/account"
                onClick={() => setMenuOpen(false)}
              >
                <span className="nav-account-avatar" aria-hidden="true">
                  {account.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="nav-account-copy">
                  <strong>{account.name}</strong>
                  <small>My account</small>
                </span>
              </a>
              <button className="nav-signout" type="button" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          ) : (
            <a
              className={currentPath === '/account' ? 'active' : ''}
              href="/account"
              onClick={() => setMenuOpen(false)}
            >
              Sign in
            </a>
          )}

          <a
            className={`nav-download ${currentPath === '/download' ? 'active' : ''}`}
            href="/download"
            onClick={() => setMenuOpen(false)}
          >
            Get FaithStream Studio <Icon name="arrow" size={16} />
          </a>
        </nav>
      </div>
    </header>
  )
}