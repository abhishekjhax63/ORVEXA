import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

/**
 * Browser client. Only ever holds the public anon key, so it is safe to ship to
 * the client bundle — row access is enforced by the RLS policies in
 * `supabase/migrations`. Sessions live in cookies so the server can read them.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder";
  return createBrowserClient<Database>(url, key);
}
