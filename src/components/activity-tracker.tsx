
'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * @fileOverview Global Site Traffic Monitor.
 * Silently records page transitions to Firestore for administrative auditing.
 * Helps Super Admins understand reader behavior and popular content.
 */
export function ActivityTracker() {
  const pathname = usePathname();
  const { user } = useUser();
  const db = useFirestore();

  useEffect(() => {
    if (!db) return;

    // Log the visit to Firestore
    const logVisit = async () => {
      try {
        const logsRef = collection(db, 'activityLogs');
        await addDoc(logsRef, {
          path: pathname,
          uid: user?.uid || 'anonymous',
          email: user?.email || 'Guest',
          timestamp: serverTimestamp(),
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
          isAnonymous: !user || user.isAnonymous
        });
      } catch (err) {
        // Silently fail to not interrupt user experience
        console.warn("Activity logging paused: connection restricted.");
      }
    };

    // Small delay to ensure route stabilization
    const timer = setTimeout(logVisit, 1000);
    return () => clearTimeout(timer);
  }, [pathname, user, db]);

  return null; // This component has no visual presence
}
