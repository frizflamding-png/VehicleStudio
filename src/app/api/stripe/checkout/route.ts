import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

type CheckoutBody = {
  priceId?: string;
};

export async function POST(request: Request) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
    }

    const { priceId } = (await request.json()) as CheckoutBody;
    if (!priceId) {
      return NextResponse.json({ error: 'Missing priceId' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[CHECKOUT] Starting checkout for user:', user.id);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle<{ stripe_customer_id: string | null }>();

    if (profileError) {
      console.error('[CHECKOUT] Profile error:', profileError);
      return NextResponse.json({ error: 'Unable to load profile' }, { status: 500 });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-12-18.acacia' });
    let stripeCustomerId = profile?.stripe_customer_id ?? null;

    if (!stripeCustomerId) {
      // Create new Stripe customer with user_id in metadata
      console.log('[CHECKOUT] Creating new Stripe customer for user:', user.id);
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: {
          user_id: user.id,
        },
      });
      stripeCustomerId = customer.id;

      // Save customer ID to profile
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({ id: user.id, stripe_customer_id: stripeCustomerId }, { onConflict: 'id' });

      if (updateError) {
        console.error('[CHECKOUT] Error saving customer ID:', updateError);
        return NextResponse.json({ error: 'Unable to update customer' }, { status: 500 });
      }

      console.log('[CHECKOUT] Created customer:', stripeCustomerId);
    } else {
      // Ensure existing customer has user_id metadata (fix for old customers)
      try {
        const existingCustomer = await stripe.customers.retrieve(stripeCustomerId);
        if (!existingCustomer.deleted && !existingCustomer.metadata?.user_id) {
          console.log('[CHECKOUT] Updating customer metadata with user_id:', user.id);
          await stripe.customers.update(stripeCustomerId, {
            metadata: {
              user_id: user.id,
            },
          });
        }
      } catch (err) {
        console.error('[CHECKOUT] Error updating customer metadata:', err);
        // Continue anyway - not critical
      }
    }

    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    // Create checkout session with subscription_data to pass user_id and trial
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId ?? undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/studio?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          user_id: user.id,
        },
      },
    });

    console.log('[CHECKOUT] Created session:', session.id);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('[CHECKOUT] Stripe checkout error:', error);
    return NextResponse.json({ error: 'Stripe checkout error' }, { status: 500 });
  }
}
