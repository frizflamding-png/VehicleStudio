import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) {
    return <AppShell>{children}</AppShell>;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.log('[AUTH] No session - redirect to /signin');
    redirect('/signin');
  }

  return <AppShell>{children}</AppShell>;
}
