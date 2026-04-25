import { getApps, getApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getClientApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function getClientAuth(): Auth {
  return getAuth(getClientApp());
}

async function postIdTokenForSession(idToken: string): Promise<void> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error("Failed to create session");
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(getClientAuth(), provider);
  const idToken = await result.user.getIdToken();
  await postIdTokenForSession(idToken);
  return result.user;
}

// Refresh the server-side `__session` cookie from the current Firebase user.
// Use before any server action that calls requireSession(), in case the
// cookie expired or never made it to this browser even though the Firebase
// client SDK still has the user cached.
export async function ensureServerSession(): Promise<void> {
  const auth = getClientAuth();
  const u = auth.currentUser;
  if (!u) {
    await signInWithGoogle();
    return;
  }
  // forceRefresh=true so we send a fresh, non-expired ID token.
  const idToken = await u.getIdToken(true);
  await postIdTokenForSession(idToken);
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/session", { method: "DELETE" });
  await firebaseSignOut(getClientAuth());
}
