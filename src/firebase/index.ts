'use client';

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';

import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  getToken,
} from 'firebase/app-check';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app =
  getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig);

let appCheckInitialized = false;

export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const storage = getStorage(app);

export async function setupFirebase() {
  if (
    typeof window !== 'undefined' &&
    !appCheckInitialized
  ) {
    console.log(
      'SITE KEY:',
      process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
    );

    const appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(
        process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!
      ),
      isTokenAutoRefreshEnabled: true,
    });

    appCheckInitialized = true;

    try {
      const token = await getToken(appCheck, false);

      console.log(
        'APP CHECK TOKEN SUCCESS:',
        token
      );
    } catch (err) {
      console.error(
        'APP CHECK TOKEN FAILURE:',
        err
      );
    }
  }

  await setPersistence(auth, browserLocalPersistence);
}
