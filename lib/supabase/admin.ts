import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database";

let cached: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Server-only Supabase client (service role).
 * HANYA boleh diimport dari API routes / server code — tidak pernah dari client.
 */
export function createAdminClient() {
  if (cached) return cached;
  cached = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  return cached;
}

export const isSupabaseConfigured = () =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );