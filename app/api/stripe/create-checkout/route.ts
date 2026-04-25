import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getUserDoc } from "@/lib/db/users";
import { adminDb } from "@/lib/firebase/admin";
import { appUrl, getStripe, priceIdFor } from "@/lib/stripe/client";

type Body = { plan?: "monthly" | "annual" };

export async function POST(req: Request) {
  const { plan } = (await req.json()) as Body;
  if (plan !== "monthly" && plan !== "annual") {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const session = await requireSession();
  const user = await getUserDoc(session.uid);
  if (!user) return NextResponse.json({ error: "No user doc" }, { status: 404 });

  const stripe = getStripe();

  let customerId = user.subscription.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.displayName || undefined,
      metadata: { uid: session.uid },
    });
    customerId = customer.id;
    await adminDb()
      .collection("users")
      .doc(session.uid)
      .update({ "subscription.stripeCustomerId": customerId });
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: session.uid,
    line_items: [{ price: priceIdFor(plan), quantity: 1 }],
    success_url: `${appUrl()}/account?checkout=success`,
    cancel_url: `${appUrl()}/upgrade?checkout=canceled`,
    allow_promotion_codes: true,
    metadata: { uid: session.uid, plan },
  });

  if (!checkout.url) {
    return NextResponse.json({ error: "No checkout URL" }, { status: 500 });
  }
  return NextResponse.json({ url: checkout.url });
}
