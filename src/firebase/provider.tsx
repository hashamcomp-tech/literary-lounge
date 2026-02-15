'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, User, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from '@/firebase/config';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

type FirebaseContextType = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  storage: FirebaseStorage;
  user: User | null;
  isUserLoading: boolean;
};

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [firebaseContext, setFirebaseContext] = useState<FirebaseContextType | null>(null);
  const [userState, setUserState] = useState<{ user: User | null; loading: boolean }>({
    user: null,
    loading: true,
  });

  useEffect(() => {
    // 1. Initialize Firebase services
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    const auth = getAuth(app);
    const firestore = getFirestore(app);
    const storage = getStorage(app);

    // 2. Setup Auth state listener
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        signInAnonymously(auth).catch(console.error);
      } else {
        setUserState({ user, loading: false });
      }
    });

    setFirebaseContext({ 
      app, 
      auth, 
      firestore, 
      storage,
      user: null, // Placeholder, updated via useEffect below
      isUserLoading: true 
    });

    return () => unsubscribe();
  }, []);

  // Update context with live user state
  const contextValue = firebaseContext ? {
    ...firebaseContext,
    user: userState.user,
    isUserLoading: userState.loading
  } : null;

  if (!contextValue) return null;

  return (
    <FirebaseContext.Provider value={contextValue}>
      <FirebaseErrorListener />
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  const context = useContext(FirebaseContext);
  if (!context) throw new Error('useFirebase must be used within FirebaseProvider');
  return context;
}

// Helper hooks for convenience
export const useAuth = () => useFirebase().auth;
export const useFirestore = () => useFirebase().firestore;
export const useStorage = () => useFirebase().storage;
export const useUser = () => {
  const { user, isUserLoading } = useFirebase();
  return { user, isUserLoading };
};

// Re-export memoization helper
export function useMemoFirebase<T>(factory: () => T, deps: React.DependencyList): T & {__memo?: boolean} {
  const memoized = React.useMemo(factory, deps);
  if (memoized && typeof memoized === 'object') {
    (memoized as any).__memo = true;
  }
  return memoized as any;
}
