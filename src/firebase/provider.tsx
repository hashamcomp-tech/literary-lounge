'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, User, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from '@/firebase/config';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { Loader2 } from 'lucide-react';

type FirebaseContextType = {
  app: FirebaseApp | null;
  auth: Auth | null;
  firestore: Firestore | null;
  storage: FirebaseStorage | null;
  user: User | null;
  isUserLoading: boolean;
  isOfflineMode: boolean;
};

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [firebaseContext, setFirebaseContext] = useState<FirebaseContextType | null>(null);
  const [userState, setUserState] = useState<{ user: User | null; loading: boolean }>({
    user: null,
    loading: true,
  });

  useEffect(() => {
    let app: FirebaseApp | null = null;
    let auth: Auth | null = null;
    let firestore: Firestore | null = null;
    let storage: FirebaseStorage | null = null;
    let isOffline = false;

    try {
      // Attempt to initialize Firebase services
      app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
      auth = getAuth(app);
      firestore = getFirestore(app);
      storage = getStorage(app);

      // Setup Auth state listener if auth is available
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (!user && auth) {
          signInAnonymously(auth).catch((err) => {
            console.warn("Anonymous auth failed, proceeding in offline mode:", err);
            setUserState({ user: null, loading: false });
          });
        } else {
          setUserState({ user, loading: false });
        }
      });

      setFirebaseContext({ 
        app, 
        auth, 
        firestore, 
        storage,
        user: null, 
        isUserLoading: true,
        isOfflineMode: false
      });

      return () => unsubscribe();
    } catch (err) {
      console.warn("Firebase not detected or configuration missing. Entering Independent Mode.");
      isOffline = true;
      setUserState({ user: null, loading: false });
      setFirebaseContext({ 
        app: null, 
        auth: null, 
        firestore: null, 
        storage: null,
        user: null, 
        isUserLoading: false,
        isOfflineMode: true 
      });
    }
  }, []);

  const contextValue = firebaseContext ? {
    ...firebaseContext,
    user: userState.user,
    isUserLoading: userState.loading
  } : null;

  if (!contextValue) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">
          Opening the Lounge...
        </p>
      </div>
    );
  }

  return (
    <FirebaseContext.Provider value={contextValue}>
      {contextValue.app && <FirebaseErrorListener />}
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  const context = useContext(FirebaseContext);
  if (!context) throw new Error('useFirebase must be used within FirebaseProvider');
  return context;
}

export const useAuth = () => useFirebase().auth;
export const useFirestore = () => useFirebase().firestore;
export const useStorage = () => useFirebase().storage;
export const useUser = () => {
  const { user, isUserLoading } = useFirebase();
  return { user, isUserLoading };
};

export function useMemoFirebase<T>(factory: () => T, deps: React.DependencyList): T & {__memo?: boolean} {
  const memoized = React.useMemo(factory, deps);
  if (memoized && typeof memoized === 'object') {
    (memoized as any).__memo = true;
  }
  return memoized as any;
}
