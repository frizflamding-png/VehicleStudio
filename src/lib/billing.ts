import { createAdminClient } from '@/lib/supabase/admin';

// ============================================
// SINGLE SOURCE OF TRUTH FOR "PAID" STATUS
// ============================================

/**
 * Statuses considered "paid" for subscription access
 * - 'active': Normal paid subscription
 * - 'trialing': In trial period
 * - 'past_due': Grace period (payment failed but still has access for a few days)
 */
const PAID_STATUSES = new Set(['active', 'trialing', 'past_due']);

/**
 * Check if a subscription status grants paid access
 * This is the SINGLE SOURCE OF TRUTH for "paid" logic
 */
export function isPaidStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return PAID_STATUSES.has(status);
}

/**
 * Check if a user has paid access by user ID
 * Uses admin client to bypass RLS
 */
export async function isPaidUser(userId: string): Promise<{ isPaid: boolean; status: string | null; debug: string }> {
  if (!userId) {
    return { isPaid: false, status: null, debug: 'No userId provided' };
  }

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('stripe_subscription_status, stripe_customer_id')
    .eq('id', userId)
    .maybeSingle<{ stripe_subscription_status: string | null; stripe_customer_id: string | null }>();

  if (error) {
    console.error('[PAYWALL] Error fetching profile:', error);
    return { isPaid: false, status: null, debug: `DB error: ${error.message}` };
  }

  if (!profile) {
    console.log('[PAYWALL] No profile found for user:', userId);
    return { isPaid: false, status: null, debug: 'No profile row found' };
  }

  const status = profile.stripe_subscription_status;
  const isPaid = isPaidStatus(status);

  console.log('[PAYWALL] User check:', {
    userId,
    status,
    isPaid,
    hasCustomerId: Boolean(profile.stripe_customer_id),
  });

  return { 
    isPaid, 
    status, 
    debug: `status=${status}, isPaid=${isPaid}` 
  };
}

// ============================================
// STRIPE SYNC UTILITIES
// ============================================

/**
 * Sync subscription status from Stripe to database
 * Used by webhooks and fallback sync endpoint
 */
export async function syncSubscriptionToDb(params: {
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
  status: string;
  priceId?: string | null;
  userId?: string; // Optional: if we know the user ID directly
}): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient();
  const { stripeCustomerId, stripeSubscriptionId, status, priceId, userId } = params;

  console.log('[STRIPE_SYNC] Syncing subscription:', {
    stripeCustomerId,
    stripeSubscriptionId,
    status,
    priceId,
    userId,
  });

  // Try to update by user_id first (most reliable)
  if (userId) {
    const { error } = await admin
      .from('profiles')
      .upsert({
        id: userId,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId ?? null,
        stripe_subscription_status: status,
        plan: priceId ?? null,
      }, { onConflict: 'id' });

    if (error) {
      console.error('[STRIPE_SYNC] Error upserting by user_id:', error);
      return { success: false, error: error.message };
    }

    console.log('[STRIPE_SYNC] Successfully synced by user_id:', userId);
    return { success: true };
  }

  // Fallback: Update by stripe_customer_id
  const { data: existing, error: lookupError } = await admin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle<{ id: string }>();

  if (lookupError) {
    console.error('[STRIPE_SYNC] Error looking up by customer_id:', lookupError);
    return { success: false, error: lookupError.message };
  }

  if (!existing) {
    console.warn('[STRIPE_SYNC] No profile found for customer_id:', stripeCustomerId);
    return { success: false, error: 'No profile found for this Stripe customer' };
  }

  const { error: updateError } = await admin
    .from('profiles')
    .update({
      stripe_subscription_id: stripeSubscriptionId ?? null,
      stripe_subscription_status: status,
      plan: priceId ?? null,
    })
    .eq('id', existing.id);

  if (updateError) {
    console.error('[STRIPE_SYNC] Error updating profile:', updateError);
    return { success: false, error: updateError.message };
  }

  console.log('[STRIPE_SYNC] Successfully synced by customer_id for user:', existing.id);
  return { success: true };
}
