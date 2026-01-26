import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPaidStatus, syncSubscriptionToDb } from '@/lib/billing';

/**
 * POST /api/stripe/sync
 * 
 * Fallback endpoint to sync subscription status from Stripe.
 * Called when user accesses /studio and we need to verify their status.
 * 
 * This handles the case where webhooks failed or were delayed.
 */
export async function POST() {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    // Get current user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[SYNC] Starting sync for user:', user.id);

    // Get user's profile with Stripe info
    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('stripe_customer_id, stripe_subscription_id, stripe_subscription_status')
      .eq('id', user.id)
      .maybeSingle<{ 
        stripe_customer_id: string | null; 
        stripe_subscription_id: string | null;
        stripe_subscription_status: string | null;
      }>();

    if (profileError) {
      console.error('[SYNC] Error fetching profile:', profileError);
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }

    // If no Stripe customer ID, they haven't subscribed yet
    if (!profile?.stripe_customer_id) {
      console.log('[SYNC] No Stripe customer ID found for user:', user.id);
      return NextResponse.json({ 
        synced: true, 
        status: null, 
        isPaid: false,
        debug: 'No Stripe customer ID - user has not subscribed'
      });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });

    // Fetch latest subscription status from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: 'all',
      limit: 1,
      expand: ['data.items.data.price'],
    });

    const latestSubscription = subscriptions.data[0];

    if (!latestSubscription) {
      console.log('[SYNC] No subscription found in Stripe for customer:', profile.stripe_customer_id);
      
      // Update DB to reflect no active subscription
      await admin
        .from('profiles')
        .update({
          stripe_subscription_id: null,
          stripe_subscription_status: 'canceled',
          plan: null,
        })
        .eq('id', user.id);

      return NextResponse.json({ 
        synced: true, 
        status: 'canceled', 
        isPaid: false,
        debug: 'No subscription found in Stripe'
      });
    }

    const stripeStatus = latestSubscription.status;
    const priceId = latestSubscription.items.data[0]?.price?.id ?? null;

    console.log('[SYNC] Found subscription:', {
      subscriptionId: latestSubscription.id,
      stripeStatus,
      dbStatus: profile.stripe_subscription_status,
      priceId,
    });

    // Sync to database
    const syncResult = await syncSubscriptionToDb({
      stripeCustomerId: profile.stripe_customer_id,
      stripeSubscriptionId: latestSubscription.id,
      status: stripeStatus,
      priceId,
      userId: user.id,
    });

    if (!syncResult.success) {
      console.error('[SYNC] Failed to sync:', syncResult.error);
      return NextResponse.json({ 
        error: 'Failed to sync subscription',
        debug: syncResult.error
      }, { status: 500 });
    }

    const isPaid = isPaidStatus(stripeStatus);

    console.log('[SYNC] Sync complete:', {
      userId: user.id,
      stripeStatus,
      isPaid,
      wasOutOfSync: profile.stripe_subscription_status !== stripeStatus,
    });

    return NextResponse.json({ 
      synced: true, 
      status: stripeStatus, 
      isPaid,
      debug: `Synced from Stripe: ${stripeStatus}, was: ${profile.stripe_subscription_status}`
    });

  } catch (error) {
    console.error('[SYNC] Error:', error);
    return NextResponse.json({ 
      error: 'Sync failed',
      debug: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
