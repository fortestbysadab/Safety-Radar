/**
 * config/supabase.js
 * ------------------
 * Server-side Supabase client using the SERVICE_ROLE_KEY. This client is
 * used ONLY to verify Google OAuth JWTs from mobile/web clients (via
 * auth.getUser(jwt)). It is NEVER exposed to the browser.
 *
 * All DB reads/writes go through pg directly (`./db.js`) so that we can call
 * custom PostGIS functions without the Supabase Data API getting in the way.
 */
import { createClient } from '@supabase/supabase-js';
import ws from 'ws'; // Node <22 lacks a global WebSocket; shim it for supabase-js.
import { env } from './env.js';

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  // We don't use Realtime in the backend, but supabase-js >=2 eagerly
  // constructs a Realtime client in the constructor. Hand it `ws` so the
  // import works on Node 20; `enabled:false` keeps it from connecting.
  realtime: {
    enabled: false,
    transport: ws,
  },
});
