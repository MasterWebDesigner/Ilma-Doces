import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";

const emuladorLocal = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === "1";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: emuladorLocal ? "demo-ilma-doces" : process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const auth = getAuth(app);

const chaves = globalThis as typeof globalThis & {
  __ilmaFirestoreEmulador?: WeakSet<object>;
  __ilmaAuthEmulador?: WeakSet<object>;
};

if (emuladorLocal) {
  const firestores = chaves.__ilmaFirestoreEmulador ?? (chaves.__ilmaFirestoreEmulador = new WeakSet());
  if (!firestores.has(db)) {
    firestores.add(db);
    try {
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
    } catch {}
  }

  const auths = chaves.__ilmaAuthEmulador ?? (chaves.__ilmaAuthEmulador = new WeakSet());
  if (!auths.has(auth)) {
    auths.add(auth);
    try {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    } catch {}
  }
}
