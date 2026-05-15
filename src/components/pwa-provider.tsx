'use client';

import { useEffect, useState } from 'react';
import { useServiceWorker } from '@/hooks/use-service-worker';

export function PWAProvider({ children }: { children: React.ReactNode }) {
  useServiceWorker();

  const [isOnline, setIsOnline] = useState(true);
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => { setIsOnline(true); setShowOfflineBanner(false); };
    const handleOffline = () => { setIsOnline(false); setShowOfflineBanner(true); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <>
      {showOfflineBanner && (
        <div style={{
          position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: '#1a2340', color: '#fff', padding: '0.6rem 1.4rem',
          borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)', pointerEvents: 'none',
        }}>
          <span>📵</span>
          <span>You&apos;re offline — your local library still works</span>
        </div>
      )}
      {isOnline && <OnlineFlash />}
      {children}
    </>
  );
}

function OnlineFlash() {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (sessionStorage.getItem('ll-was-offline') === '1') {
      sessionStorage.removeItem('ll-was-offline');
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    const mark = () => sessionStorage.setItem('ll-was-offline', '1');
    window.addEventListener('offline', mark);
    return () => window.removeEventListener('offline', mark);
  }, []);

  if (!mounted || !visible) return null;

  return (
    <div style={{
      position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, background: '#2d7a4f', color: '#fff', padding: '0.6rem 1.4rem',
      borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      boxShadow: '0 4px 20px rgba(0,0,0,0.2)', pointerEvents: 'none',
    }}>
      <span>✅</span>
      <span>Back online</span>
    </div>
  );
}
