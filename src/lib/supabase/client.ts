import { createBrowserClient, type SupabaseClient } from '@supabase/ssr';

// Check if Supabase is properly configured
export function isSupabaseConfigured(): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return !!(supabaseUrl && supabaseAnonKey && 
    !supabaseUrl.includes('your-project') && 
    !supabaseUrl.includes('your_') &&
    !supabaseAnonKey.includes('your_'));
}

export function createClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || 
      supabaseUrl.includes('your-project') || 
      supabaseUrl.includes('your_') ||
      supabaseAnonKey.includes('your_')) {
    throw new Error('Supabase is not configured. Please add your Supabase URL and keys to .env.local');
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
