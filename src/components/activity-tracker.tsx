
'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * @fileOverview Global Site Traffic Monitor.
 * Silently records page transitions to Firestore for administrative auditing.
 * Helps Super Admins understand reader behavior and popular content.
 * 
 * NOTE: Tracking is suppressed for the Super Admin to maintain clean analytics.
 */
export function ActivityTracker() {
  const pathname = usePathname();
  const { user, isUserLoading } = useUser();
  const db = useFirestore();

  useEffect(() => {
    if (!db || isUserLoading) return;

    // Suppression Protocol: Do not log activity for the Super Admin
    const isSuperAdmin = user?.email === 'hashamcomp@gmail.com';
    if (isSuperAdmin) return;

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
  }, [pathname, user, isUserLoading, db]);

  return null; // This component has no visual presence
}
