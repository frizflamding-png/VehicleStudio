import { createAdminClient } from '@/lib/supabase/admin';

const PAID_STATUSES = new Set(['active', 'trialing']);

export async function isPaidUser(userId: string): Promise<boolean> {
  if (!userId) return false;
  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('stripe_subscription_status')
    .eq('id', userId)
    .maybeSingle<{ stripe_subscription_status: string | null }>();

  if (error) {
    return false;
  }

  return PAID_STATUSES.has(profile?.stripe_subscription_status ?? '');
}
