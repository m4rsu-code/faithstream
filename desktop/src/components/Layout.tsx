import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from './Header';
import SidebarNav from './SidebarNav';
import StatusFooter from './StatusFooter';
import AuthGate from './AuthGate';
import Studio, { StudioVisibilityContext } from '../Routes/Studio';

const PresentationPage = memo(lazy(() => import('../Routes/Presentation')));
const SettingsPage = memo(lazy(() => import('../Routes/Settings')));

// Studio stays mounted in the background so an active stream keeps running. Its meters pause
// while hidden, and memo keeps the scene previews stable during ordinary Studio state updates.
const BackgroundStudio = memo(Studio);

type StudioSession = { live: boolean; streamStatus: string };
const readStreamFooterMessage = () => {
  try {
    const session = JSON.parse(localStorage.getItem('faithstream.studio-session') ?? 'null') as StudioSession | null;
    if (session?.live && session.streamStatus === 'live') return 'Ready. Your stream is live on Facebook.';
    if (session?.live) return 'Connecting to Facebook Live…';
    if (session?.streamStatus === 'error') return 'Stream is not connected. See Notifications for details.';
  } catch { /* Use the offline status if saved session state is unavailable. */ }
  return 'Ready. Your stream is not connected.';
};

export default function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const studioActive = pathname === '/';
  const presentationActive = pathname === '/presentations' || pathname === '/songbooks';
  const settingsActive = pathname === '/settings';
  const studioLayerRef = useRef<HTMLDivElement>(null);
  const pageLayerRef = useRef<HTMLDivElement>(null);
  const [studioModalOpen, setStudioModalOpen] = useState(false);
  const [footerMessage, setFooterMessage] = useState(readStreamFooterMessage);
  const [visitedPages, setVisitedPages] = useState(() => new Set(pathname === '/settings' ? ['settings'] : presentationActive ? ['presentations'] : []));

  useEffect(() => {
    if (pathname === '/songbooks') {
      navigate('/presentations?view=songbooks', { replace: true });
      setVisitedPages((current) => new Set(current).add('presentations'));
    } else if (pathname === '/presentations') {
      setVisitedPages((current) => current.has('presentations') ? current : new Set(current).add('presentations'));
    } else if (pathname === '/settings') {
      setVisitedPages((current) => current.has('settings') ? current : new Set(current).add('settings'));
    } else if (pathname !== '/') {
      navigate('/', { replace: true });
    }
  }, [navigate, pathname]);

  useEffect(() => {
    const updateMessage = (event?: Event) => {
      if (event instanceof StorageEvent && event.key !== 'faithstream.studio-session') return;
      setFooterMessage(readStreamFooterMessage());
    };
    window.addEventListener('faithstream:studio-session', updateMessage);
    window.addEventListener('storage', updateMessage);
    return () => {
      window.removeEventListener('faithstream:studio-session', updateMessage);
      window.removeEventListener('storage', updateMessage);
    };
  }, []);

  useEffect(() => {
    const layer = studioActive ? studioLayerRef.current : pageLayerRef.current;
    if (!layer) return;
    const updateModalLayer = () => setStudioModalOpen(!!layer.querySelector('[aria-modal="true"]'));
    const observer = new MutationObserver(updateModalLayer);
    observer.observe(layer, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'aria-modal'] });
    updateModalLayer();
    return () => observer.disconnect();
  }, [studioActive]);

  return (
    <AuthGate>
      <div className="flex h-screen flex-col bg-navy">
        <Header />
        <div className="flex min-h-0 flex-1">
          <SidebarNav />
          <main className="relative min-h-0 min-w-0 flex-1 overflow-visible">
            {/* While another page is open, Studio is made invisible (not just see-through), so the
                computer stops drawing its previews; streaming, recording and output windows keep running. */}
            <div ref={studioLayerRef} aria-hidden={!studioActive} style={{ zIndex: studioActive ? studioModalOpen ? 1000 : 30 : 0 }} className={`absolute inset-0 p-4 ${studioActive ? '' : 'pointer-events-none invisible'}`}>
              <StudioVisibilityContext.Provider value={studioActive}>
                <BackgroundStudio />
              </StudioVisibilityContext.Provider>
            </div>
            <div ref={pageLayerRef} style={{ zIndex: studioActive ? 0 : studioModalOpen ? 1000 : 10 }} className={`absolute inset-0 p-4 ${studioActive ? 'hidden' : ''}`}>
              {visitedPages.has('presentations') && <div aria-hidden={!presentationActive} className={presentationActive ? 'h-full w-full' : 'hidden'}><Suspense fallback={<PageLoading />}><PresentationPage /></Suspense></div>}
              {visitedPages.has('settings') && <div aria-hidden={!settingsActive} className={settingsActive ? 'h-full w-full' : 'hidden'}><Suspense fallback={<PageLoading />}><SettingsPage /></Suspense></div>}
            </div>
          </main>
        </div>
        <StatusFooter message={footerMessage} />
      </div>
    </AuthGate>
  );
}

function PageLoading() {
  return <div className="flex h-full items-center justify-center text-sm text-warm-white/55">Opening page…</div>;
}
