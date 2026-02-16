'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, User, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from '@/firebase/config';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { Loader2, ShieldAlert } from 'lucide-react';

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
  const [error, setError] = useState<string | null>(null);
  const [userState, setUserState] = useState<{ user: User | null; loading: boolean }>({
    user: null,
    loading: true,
  });

  useEffect(() => {
    try {
      // 1. Initialize Firebase services
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
      const auth = getAuth(app);
      const firestore = getFirestore(app);
      const storage = getStorage(app);

      // 2. Setup Auth state listener
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (!user) {
          // Attempt to provide a session for guests automatically
          signInAnonymously(auth).catch((err) => {
            console.error("Anonymous auth failed:", err);
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
        user: null, // Placeholder, updated via userState
        isUserLoading: true 
      });

      return () => unsubscribe();
    } catch (err: any) {
      console.error("Firebase initialization failed:", err);
      setError("Failed to connect to Lounge services. Please check your internet connection and Firebase configuration.");
    }
  }, []);

  // Update context with live user state
  const contextValue = firebaseContext ? {
    ...firebaseContext,
    user: userState.user,
    isUserLoading: userState.loading
  } : null;

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4 opacity-20" />
        <h1 className="text-3xl font-headline font-black mb-2">Connection Error</h1>
        <p className="text-muted-foreground max-w-md">{error}</p>
      </div>
    );
  }

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
