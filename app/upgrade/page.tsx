import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getUserDoc, isSubscriptionActive } from "@/lib/db/users";
import { PricingCards } from "@/components/pricing-cards";

export default async function UpgradePage() {
  const session = await getSessionUser();
  if (session) {
    const user = await getUserDoc(session.uid);
    if (user && isSubscriptionActive(user)) redirect("/account");
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-16">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-semibold tracking-tight">Upgrade to unlock</h1>
        <p className="text-muted-foreground mt-3">
          All 1,000 problems. All 10 tracks. AI tutor on every problem.
        </p>
      </div>
      <PricingCards />
    </main>
  );
}
