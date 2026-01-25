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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle<{ stripe_customer_id: string | null }>();

    if (profileError) {
      return NextResponse.json({ error: 'Unable to load profile' }, { status: 500 });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });
    let stripeCustomerId = profile?.stripe_customer_id ?? null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: {
          user_id: user.id,
        },
      });
      stripeCustomerId = customer.id;

      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({ id: user.id, stripe_customer_id: stripeCustomerId }, { onConflict: 'id' });

      if (updateError) {
        return NextResponse.json({ error: 'Unable to update customer' }, { status: 500 });
      }
    }

    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId ?? undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/studio?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json({ error: 'Stripe checkout error' }, { status: 500 });
  }
}
