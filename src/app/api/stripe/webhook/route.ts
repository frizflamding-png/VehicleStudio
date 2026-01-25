import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2023-10-16',
});

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const admin = createAdminClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      if (customerId && subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const status = subscription.status;
        const priceId = subscription.items.data[0]?.price?.id ?? null;
        await admin
          .from('profiles')
          .update({
            stripe_customer_id: customerId,
            stripe_subscription_status: status,
            plan: priceId,
          })
          .eq('stripe_customer_id', customerId);
      }
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
      const status = subscription.status;
      const priceId = subscription.items.data[0]?.price?.id ?? null;
      if (customerId) {
        await admin
          .from('profiles')
          .update({
            stripe_subscription_status: status,
            plan: priceId,
          })
          .eq('stripe_customer_id', customerId);
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
