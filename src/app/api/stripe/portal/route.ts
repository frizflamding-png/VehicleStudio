import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle<{ stripe_customer_id: string | null }>();

    if (error) {
      return NextResponse.json({ error: 'Unable to load subscription' }, { status: 500 });
    }

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const returnUrl = new URL('/account', origin).toString();

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe portal error:', error);
    return NextResponse.json({ error: 'Stripe portal error' }, { status: 500 });
  }
}
