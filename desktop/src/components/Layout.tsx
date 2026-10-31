import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import SidebarNav from './SidebarNav';
import StatusFooter from './StatusFooter';
import AuthGate from './AuthGate';
import Studio from '../Routes/Studio';

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
  const studioActive = pathname === '/';
  const studioLayerRef = useRef<HTMLDivElement>(null);
  const pageLayerRef = useRef<HTMLDivElement>(null);
  const [studioModalOpen, setStudioModalOpen] = useState(false);
  const [footerMessage, setFooterMessage] = useState(readStreamFooterMessage);

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
            <div ref={studioLayerRef} aria-hidden={!studioActive} style={{ zIndex: studioActive ? studioModalOpen ? 1000 : 30 : 0 }} className={`absolute inset-0 p-4 ${studioActive ? '' : 'pointer-events-none opacity-0'}`}>
              <Studio />
            </div>
            <div ref={pageLayerRef} style={{ zIndex: studioActive ? 0 : studioModalOpen ? 1000 : 10 }} className={`absolute inset-0 p-4 ${studioActive ? 'hidden' : ''}`}>
              <Outlet />
            </div>
          </main>
        </div>
        <StatusFooter message={footerMessage} />
      </div>
    </AuthGate>
  );
}
