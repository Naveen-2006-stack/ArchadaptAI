import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client for a route handler, acting AS THE CALLING USER.
 * The browser forwards its session access token in the Authorization header; passing it on means
 * Row Level Security evaluates auth.uid() as that user. No service-role key is used anywhere.
 * Without a token the client is anonymous and RLS exposes nothing, so callers must not rely on it.
 */
export function supabaseForRequest(request: Request): { client: SupabaseClient; authenticated: boolean } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';
  const authorization = request.headers.get('authorization') || '';
  const authenticated = /^Bearer\s+\S+/i.test(authorization);
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: authenticated ? { headers: { Authorization: authorization } } : undefined
  });
  return { client, authenticated };
}
