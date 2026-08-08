import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  memoryLocalCache,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Selalu gunakan authDomain resmi Firebase (kasircerdas-f464b.firebaseapp.com).
// Pendekatan proxy Vercel (/__/auth/*) tidak bisa diandalkan karena Vercel
// catch-all /(.*) bisa mengintersep request sebelum proxy sempat jalan,
// sehingga Firebase auth handler tidak pernah diproses → redirect loop.
const app = initializeApp(firebaseConfig);


// ---------------------------------------------------------------------------
// Deteksi apakah app berjalan sebagai PWA standalone
// (installasi dari homescreen Android/iOS)
// ---------------------------------------------------------------------------
const isPWAStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as any).standalone === true;

// ---------------------------------------------------------------------------
// Initialize Firestore dengan strategi cache berbeda:
// - Browser biasa  : multipleTabManager (full sync antar tab)
// - PWA standalone : singleTabManager  (hindari BroadcastChannel crash di
//                    beberapa Android WebView custom seperti XOS/MIUI)
// - Fallback       : memoryLocalCache jika IndexedDB tidak tersedia
// ---------------------------------------------------------------------------
function createFirestore() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: isPWAStandalone
          ? persistentSingleTabManager({ forceOwnership: true })
          : persistentMultipleTabManager(),
      }),
    });
  } catch (e) {
    console.warn(
      '[Firebase] IndexedDB persistence unavailable, falling back to memory cache:',
      e,
    );
    return initializeFirestore(app, {
      localCache: memoryLocalCache(),
    });
  }
}

export const db = createFirestore();

export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
