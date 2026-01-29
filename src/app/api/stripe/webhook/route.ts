import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { syncSubscriptionToDb } from '@/lib/billing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2025-12-18.acacia',
});

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[WEBHOOK] Webhook secret not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    console.error('[WEBHOOK] Missing signature');
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('[WEBHOOK] Invalid signature:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log('[WEBHOOK] Received event:', event.type);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        
        console.log('[WEBHOOK] checkout.session.completed:', { customerId, subscriptionId });

        if (customerId && subscriptionId) {
          // Fetch full subscription details from Stripe
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const status = subscription.status;
          const priceId = subscription.items.data[0]?.price?.id ?? null;

          // Try to get user_id from customer metadata
          const customer = await stripe.customers.retrieve(customerId);
          const userId = !customer.deleted ? (customer.metadata?.user_id ?? undefined) : undefined;

          await syncSubscriptionToDb({
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            status,
            priceId,
            userId,
          });
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
        const status = subscription.status;
        const priceId = subscription.items.data[0]?.price?.id ?? null;

        console.log('[WEBHOOK] subscription event:', { type: event.type, customerId, status });

        if (customerId) {
          // Try to get user_id from customer metadata
          const customer = await stripe.customers.retrieve(customerId);
          const userId = !customer.deleted ? (customer.metadata?.user_id ?? undefined) : undefined;

          await syncSubscriptionToDb({
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscription.id,
            status,
            priceId,
            userId,
          });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;

        console.log('[WEBHOOK] invoice.payment_succeeded:', { customerId, subscriptionId });

        if (customerId && subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const customer = await stripe.customers.retrieve(customerId);
          const userId = !customer.deleted ? (customer.metadata?.user_id ?? undefined) : undefined;

          await syncSubscriptionToDb({
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            status: subscription.status,
            priceId: subscription.items.data[0]?.price?.id ?? null,
            userId,
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;

        console.log('[WEBHOOK] invoice.payment_failed:', { customerId, subscriptionId });

        if (customerId && subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const customer = await stripe.customers.retrieve(customerId);
          const userId = !customer.deleted ? (customer.metadata?.user_id ?? undefined) : undefined;

          // Status will be 'past_due' after payment fails
          await syncSubscriptionToDb({
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            status: subscription.status,
            priceId: subscription.items.data[0]?.price?.id ?? null,
            userId,
          });
        }
        break;
      }

      default:
        console.log('[WEBHOOK] Unhandled event type:', event.type);
        break;
    }
  } catch (err) {
    console.error('[WEBHOOK] Error processing event:', err);
    // Return 200 anyway to prevent Stripe from retrying
    // The error is logged for debugging
  }

  return NextResponse.json({ received: true });
}
