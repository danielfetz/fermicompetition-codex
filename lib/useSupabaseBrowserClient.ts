import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export function useSupabaseBrowserClient() {
  const [client, setClient] = useState<SupabaseClient<Database> | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const supabaseClient = getSupabaseBrowserClient();
      setClient(supabaseClient);
    } catch (error) {
      const clientError = error instanceof Error ? error : new Error(String(error));
      setError(clientError);
    }
  }, []);

  return { client, error };
}
