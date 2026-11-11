import { StrictMode, useEffect, useState, type MouseEvent } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import Home from './Routes/Home'
import Downloads from './Routes/Downloads'
import Plans from './Routes/Plans'
import Account from './Routes/Account'
import NotFound from './Routes/NotFound'
import SiteLayout from './components/SiteLayout'

function normalizePath(path: string) {
  const normalized = path.replace(/\/+$/, '')
  return normalized || '/'
}

export function AppRouter() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname))

  function handleInternalNavigation(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const target = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!(target instanceof HTMLAnchorElement) || target.target || target.hasAttribute('download')) return

    const destination = new URL(target.href, window.location.href)
    if (destination.origin !== window.location.origin || destination.pathname.startsWith('/api/')) return
    event.preventDefault()
    window.history.pushState({}, '', `${destination.pathname}${destination.search}${destination.hash}`)
    setPath(normalizePath(destination.pathname))

    requestAnimationFrame(() => {
      if (destination.hash) {
        document.getElementById(decodeURIComponent(destination.hash.slice(1)))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    })
  }

  useEffect(() => {
    const syncPath = () => setPath(normalizePath(window.location.pathname))
    window.addEventListener('popstate', syncPath)
    return () => window.removeEventListener('popstate', syncPath)
  }, [])

  useEffect(() => {
    const titles: Record<string, string> = {
      '/': 'FaithStream Studio — Worship media, brought together',
      '/download': 'Download FaithStream Studio',
      '/plans': 'FaithStream Studio pricing and license',
      '/account': 'FaithStream Studio account',
    }
    document.title = titles[path] ?? 'Page not found — FaithStream Studio'
  }, [path])

  const page = path === '/' ? <Home /> : path === '/download' ? <Downloads /> : path === '/plans' ? <Plans /> : path === '/account' ? <Account /> : <NotFound />
  return <div onClick={handleInternalNavigation}><SiteLayout currentPath={path}><div className="route-view" key={path}>{page}</div></SiteLayout></div>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
)
