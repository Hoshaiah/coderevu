import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { Timestamp } from "firebase-admin/firestore";
import { getStripe } from "@/lib/stripe/client";
import { adminDb } from "@/lib/firebase/admin";
import type { Plan, SubscriptionStatus } from "@/lib/db/types";

export const runtime = "nodejs";

function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "none";
  }
}

async function findUserByCustomerId(customerId: string): Promise<string | null> {
  const snap = await adminDb()
    .collection("users")
    .where("subscription.stripeCustomerId", "==", customerId)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

async function applySubscriptionToUser(uid: string, sub: Stripe.Subscription) {
  const priceId = sub.items.data[0]?.price.id;
  let plan: Plan = null;
  if (priceId && priceId === process.env.STRIPE_PRICE_MONTHLY) plan = "monthly";
  else if (priceId && priceId === process.env.STRIPE_PRICE_ANNUAL) plan = "annual";

  const periodEndSec = (sub as unknown as { current_period_end?: number }).current_period_end;

  await adminDb().collection("users").doc(uid).update({
    "subscription.status": mapStatus(sub.status),
    "subscription.plan": plan,
    "subscription.stripeSubscriptionId": sub.id,
    "subscription.stripeCustomerId": typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    "subscription.currentPeriodEnd": periodEndSec
      ? Timestamp.fromMillis(periodEndSec * 1000)
      : null,
  });
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "No webhook secret" }, { status: 500 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const body = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    console.error("Webhook signature failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const uid = (s.metadata?.uid ?? s.client_reference_id) as string | undefined;
        if (!uid) break;
        if (s.subscription) {
          const subId = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await applySubscriptionToUser(uid, sub);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const uid = await findUserByCustomerId(customerId);
        if (!uid) break;
        await applySubscriptionToUser(uid, sub);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (!customerId) break;
        const uid = await findUserByCustomerId(customerId);
        if (!uid) break;
        await adminDb()
          .collection("users")
          .doc(uid)
          .update({ "subscription.status": "past_due" });
        break;
      }
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }
}
