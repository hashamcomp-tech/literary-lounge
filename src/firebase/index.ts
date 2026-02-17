'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

/**
 * Initializes Firebase with a strict check for production environments.
 * Prevents multiple initialization attempts which can cause auth hangs.
 */
export function initializeFirebase() {
  let firebaseApp: FirebaseApp;

  if (!getApps().length) {
    try {
      // In production (Vercel), we rely on the hardcoded config to ensure the bucket name matches exactly.
      firebaseApp = initializeApp(firebaseConfig);
    } catch (e) {
      console.error('Firebase initialization failed:', e);
      firebaseApp = getApp(); // Fallback to existing
    }
  } else {
    firebaseApp = getApp();
  }

  return getSdks(firebaseApp);
}

export function getSdks(firebaseApp: FirebaseApp) {
  const auth = getAuth(firebaseApp);
  const firestore = getFirestore(firebaseApp);
  const storage = getStorage(firebaseApp);
  
  // Explicitly set browser-based persistence to keep users logged in
  if (typeof window !== 'undefined') {
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.error("Auth persistence setup failed", err);
    });
  }

  return {
    firebaseApp,
    auth,
    firestore,
    storage
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
