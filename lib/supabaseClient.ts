import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

let browserClient:
  | ReturnType<typeof createClient<Database>>
  | undefined;

export function getSupabaseBrowserClient() {
  if (typeof window === "undefined") {
    throw new Error("getSupabaseBrowserClient must be called in the browser.");
  }

  if (!browserClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase environment variables are not configured.");
    }

    browserClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: {
        headers: {
          apikey: supabaseAnonKey,
        },
      },
    });
  }

  return browserClient;
}
