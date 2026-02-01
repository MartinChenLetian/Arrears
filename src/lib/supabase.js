import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);

if (!supabaseUrl || !supabaseKey) {
  // Provide a clear runtime error if env vars are missing.
  console.warn('Supabase env vars are missing. Check your .env file.');
}

export const supabase = createClient(supabaseUrl ?? '', supabaseKey ?? '');
