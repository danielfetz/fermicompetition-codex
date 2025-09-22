import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    'Supabase credentials are missing. Please provide VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in an .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
