import { useState } from 'react'
import Icon from './Icon'

export default function Navbar({ currentPath }: { currentPath: string }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const links = [
    { label: 'Platform', href: '/#platform' },
    { label: 'How it works', href: '/#how-it-works' },
    { label: 'Watch', href: '/#watch' },
    { label: 'Plans', href: '/plans', active: currentPath === '/plans' },
  ]

  return (
    <header className="site-header">
      <div className="nav-shell">
        <a className="brand" href="/" aria-label="FaithStream home">
          <img src="/faithstream-logo.png" alt="FaithStream" />
        </a>
        <button className="mobile-menu-button" type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          <Icon name={menuOpen ? 'close' : 'menu'} size={21} />
        </button>
        <nav className={`main-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation">
          {links.map((link) => <a key={link.label} className={link.active ? 'active' : ''} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</a>)}
          <a className={`nav-download ${currentPath === '/download' ? 'active' : ''}`} href="/download" onClick={() => setMenuOpen(false)}>Get FaithStream <Icon name="arrow" size={16} /></a>
        </nav>
      </div>
    </header>
  )
}
