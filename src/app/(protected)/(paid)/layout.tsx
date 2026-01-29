import Stripe from 'stripe';
import { redirect } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPaidProfile } from '@/lib/billing';

export default async function PaidLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) {
    return children;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.log('[PAYWALL] No session - redirect to /signin');
    redirect('/signin');
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('stripe_subscription_status, stripe_customer_id, stripe_subscription_id')
    .eq('id', user.id)
    .maybeSingle<{
      stripe_subscription_status: string | null;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
    }>();

  if (error) {
    console.log('[PAYWALL] Failed to load profile:', error.message);
  }

  let isPaid = isPaidProfile(profile);

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isPaid && profile?.stripe_customer_id && serviceRoleKey) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.log('[PAYWALL] Stripe secret missing - cannot sync');
    } else {
      try {
        const admin = createAdminClient();
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-12-18.acacia' });
        const subscriptions = await stripe.subscriptions.list({
          customer: profile.stripe_customer_id,
          status: 'all',
          limit: 1,
          expand: ['data.items.data.price'],
        });

        const latest = subscriptions.data[0];
        if (latest) {
          const priceId = latest.items.data[0]?.price?.id ?? null;
          await admin
            .from('profiles')
            .update({
              stripe_subscription_id: latest.id,
              stripe_subscription_status: latest.status,
              plan: priceId,
            })
            .eq('id', user.id);
          const updatedProfile = {
            ...profile,
            stripe_subscription_status: latest.status,
          };
          isPaid = isPaidProfile(updatedProfile);
        }
      } catch (syncError) {
        console.log('[PAYWALL] Stripe sync failed:', syncError);
      }
    }
  } else if (!serviceRoleKey) {
    console.log('[PAYWALL] SUPABASE_SERVICE_ROLE_KEY missing - skipping Stripe sync');
  }

  console.log('[PAYWALL] Access decision:', {
    userId: user.id,
    stripe_subscription_status: profile?.stripe_subscription_status ?? null,
    decision: isPaid ? 'ALLOW' : 'BLOCK',
  });

  if (!isPaid) {
    redirect('/pricing?reason=paywall');
  }

  return children;
}
