
'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * @fileOverview Global Site Traffic Monitor.
 * Records page transitions to Firestore and enriches each log with the
 * visitor's IP address (fetched once per session, cached at module level)
 * so the admin Active Users panel can show country, flag & timezone.
 *
 * NOTE: Tracking is suppressed for the Super Admin to keep analytics clean.
 */

// Module-level cache — only one IP lookup per browser session
let cachedIp: string | null = null;

async function getClientIp(): Promise<string> {
  if (cachedIp) return cachedIp;
  try {
    const res = await fetch('https://ipapi.co/ip/', { cache: 'no-store' });
    if (!res.ok) throw new Error();
    const ip = (await res.text()).trim();
    cachedIp = ip;
    return ip;
  } catch {
    try {
      const res2 = await fetch('https://api.ipify.org?format=text', { cache: 'no-store' });
      if (!res2.ok) throw new Error();
      const ip = (await res2.text()).trim();
      cachedIp = ip;
      return ip;
    } catch {
      return 'unknown';
    }
  }
}

export function ActivityTracker() {
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const db = useFirestore();

  useEffect(() => {
    if (!db || isUserLoading) return;

    const isSuperAdmin = user?.email === 'hashamcomp@gmail.com';
    if (isSuperAdmin) return;

    const logVisit = async () => {
      try {
        const ip = await getClientIp();
        const logsRef = collection(db, 'activityLogs');
        await addDoc(logsRef, {
          path: pathname,
          uid: user?.uid || 'anonymous',
          email: user?.email || 'Guest',
          timestamp: serverTimestamp(),
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
          isAnonymous: !user || user.isAnonymous,
          ip,
        });
      } catch (err) {
        console.warn('Activity logging paused: connection restricted.');
      }
    };

    const timer = setTimeout(logVisit, 1000);
    return () => clearTimeout(timer);
  }, [pathname, user, isUserLoading, db]);

  return null;
}
