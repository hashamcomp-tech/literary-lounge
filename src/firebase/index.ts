'use client';

// Re-export all hooks and providers so imports from '@/firebase' work everywhere
export { FirebaseProvider, useFirebase, useAuth, useFirestore, useStorage, useUser, useMemoFirebase } from '@/firebase/provider';
export { useCollection } from '@/firebase/firestore/use-collection';
export { useDoc } from '@/firebase/firestore/use-doc';
