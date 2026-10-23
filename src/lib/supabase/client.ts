import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

/**
 * Browser client. Only ever holds the public anon key, so it is safe to ship to
 * the client bundle — row access is enforced by the RLS policies in
 * `supabase/migrations`. Sessions live in cookies so the server can read them.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
