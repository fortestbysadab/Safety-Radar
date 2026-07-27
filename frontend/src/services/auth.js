/**
 * services/auth.js
 * ----------------
 * Supabase client + auth helpers. Google OAuth is the only sign-in method.
 * Exposes a singleton supabase client, `signInWithGoogle()`, `signOut()`, and
 * an event listener so the app can react to auth state changes.
 *
 * IMPORTANT: the backend HMAC-hashes the Google sub claim before storage, so
 * the client never sees or handles anonymized identifiers.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.warn('[auth] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set; auth calls will fail.');
}

export const supabase = createClient(SUPABASE_URL ?? 'http://localhost', SUPABASE_ANON_KEY ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Begin Google OAuth flow. Supabase handles redirect/callback back to the app.
 * After the redirect completes, `supabase.auth.onAuthStateChange` fires and our
 * React context will pick up the session.
 */
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Request basic profile (no extra scopes needed — we don't read email/name).
      queryParams: { access_type: 'online', prompt: 'select_account' },
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

/** Current access token (or null). Refreshes if needed. */
export async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Subscribe to auth state changes (login/logout/token refresh). */
export function onAuthStateChange(cb) {
  return supabase.auth.onAuthStateChange(cb);
}
