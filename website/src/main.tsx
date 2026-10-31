import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import Home from './Routes/Home'
import Downloads from './Routes/Downloads'
import Plans from './Routes/Plans'
import NotFound from './Routes/NotFound'
import SiteLayout from './components/SiteLayout'

function normalizePath(path: string) {
  const normalized = path.replace(/\/+$/, '')
  return normalized || '/'
}

export function AppRouter() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname))

  useEffect(() => {
    const syncPath = () => setPath(normalizePath(window.location.pathname))
    window.addEventListener('popstate', syncPath)
    return () => window.removeEventListener('popstate', syncPath)
  }, [])

  useEffect(() => {
    const titles: Record<string, string> = {
      '/': 'FaithStream — Worship media, brought together',
      '/download': 'Download FaithStream',
      '/plans': 'FaithStream subscriptions',
    }
    document.title = titles[path] ?? 'Page not found — FaithStream'
  }, [path])

  const page = path === '/' ? <Home /> : path === '/download' ? <Downloads /> : path === '/plans' ? <Plans /> : <NotFound />
  return <SiteLayout currentPath={path}>{page}</SiteLayout>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
)
