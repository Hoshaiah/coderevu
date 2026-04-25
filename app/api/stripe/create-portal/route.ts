import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getUserDoc } from "@/lib/db/users";
import { appUrl, getStripe } from "@/lib/stripe/client";

export async function POST() {
  const session = await requireSession();
  const user = await getUserDoc(session.uid);
  if (!user?.subscription.stripeCustomerId) {
    return NextResponse.json({ error: "No customer" }, { status: 400 });
  }

  const stripe = getStripe();
  const portal = await stripe.billingPortal.sessions.create({
    customer: user.subscription.stripeCustomerId,
    return_url: `${appUrl()}/account`,
  });
  return NextResponse.json({ url: portal.url });
}
