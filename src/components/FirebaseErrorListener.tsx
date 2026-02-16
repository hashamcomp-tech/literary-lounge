
'use client';

import { useState, useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

/**
 * An invisible component that listens for globally emitted 'permission-error' events.
 * It intelligently decides whether to throw a raw error (for admins) or show a 
 * generic toast (for readers).
 */
export function FirebaseErrorListener() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [error, setError] = useState<FirestorePermissionError | null>(null);

  // Fetch the user's profile to check for the admin role
  const profileRef = useMemoFirebase(() => {
    if (!db || !user || user.isAnonymous) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);

  const { data: profile } = useDoc(profileRef);

  // Determine if the current user is an administrator
  const isAdmin = user?.email === 'hashamcomp@gmail.com' || 
                  profile?.role === 'admin';

  useEffect(() => {
    const handleError = (incomingError: FirestorePermissionError) => {
      if (isAdmin) {
        // Administrators see the raw, detailed error for debugging
        setError(incomingError);
      } else {
        // Readers see a polite, generic notification
        toast({
          variant: "destructive",
          title: "Access Restricted",
          description: "You don't have permission to perform this action in the Lounge."
        });
      }
    };

    errorEmitter.on('permission-error', handleError);

    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, [isAdmin, toast]);

  // Throwing the error triggers the Next.js error boundary (Development Overlay)
  if (error) {
    throw error;
  }

  return null;
}
