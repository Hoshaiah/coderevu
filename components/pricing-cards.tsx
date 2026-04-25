"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { ensureServerSession, signInWithGoogle } from "@/lib/firebase/client";

type Plan = "monthly" | "annual";

async function launchCheckout(plan: Plan) {
  const res = await fetch("/api/stripe/create-checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  if (!res.ok) throw new Error(await res.text());
  const { url } = (await res.json()) as { url: string };
  window.location.href = url;
}

type Tier = {
  key: Plan | "free";
  label: string;
  price: string;
  cadence: string;
  pitch: string;
  bullets: string[];
  cta: string;
  featured?: boolean;
};

const TIERS: Tier[] = [
  {
    key: "free",
    label: "Free",
    price: "$0",
    cadence: "forever",
    pitch:
      "Try the practice on one language. Ten problems, no card, no expiry.",
    bullets: [
      "10 problems, one track",
      "Reference solutions after reveal",
      "AI reviewer disabled",
    ],
    cta: "Start free",
  },
  {
    key: "monthly",
    label: "Premium",
    price: "$9.99",
    cadence: "/month",
    pitch:
      "All 1,000 problems. All 10 languages. An AI reviewer that pushes back like a staff engineer — so you learn to hold your ground.",
    bullets: [
      "1,000 problems · 10 languages",
      "AI reviewer on every problem",
      "Progress tracked across devices",
      "Cancel anytime",
    ],
    cta: "Go Premium",
    featured: true,
  },
  {
    key: "annual",
    label: "Premium Annual",
    price: "$49.99",
    cadence: "/year",
    pitch:
      "Same Premium, billed once, less than a book a month. For engineers ready to commit to the promotion.",
    bullets: [
      "Everything in Premium",
      "Billed annually — save $70",
      "AI reviewer on every problem",
    ],
    cta: "Go annual",
  },
];

export function PricingCards() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState<Plan | null>(null);

  async function handleUpgrade(plan: Plan) {
    setPending(plan);
    try {
      // Make sure the server session cookie is current. Firebase auth state
      // alone isn't enough — the server-side `__session` cookie can be stale
      // even when the client SDK still has the user.
      if (!user) {
        await signInWithGoogle();
      } else {
        await ensureServerSession();
      }
      await launchCheckout(plan);
    } catch (err) {
      console.error(err);
      toast.error("Could not start checkout. Please try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {TIERS.map((tier) => {
        const featured = tier.featured;
        return (
          <article
            key={tier.key}
            className={`relative flex flex-col rounded-lg border p-6 transition ${
              featured
                ? "border-brand/40 bg-gradient-to-b from-brand/[0.06] to-transparent"
                : "border-rule bg-surface-2 hover:border-fg-3"
            }`}
          >
            {featured && (
              <span className="absolute -top-2 left-6 px-2 py-0.5 rounded-md bg-brand text-[#0a0a0a] text-[10.5px] font-semibold tracking-wide">
                MOST POPULAR
              </span>
            )}

            <div className="flex items-baseline justify-between">
              <h3 className="text-[14px] font-medium text-fg">{tier.label}</h3>
              {featured && (
                <span className="text-[11px] text-brand font-mono tracking-wide">
                  unlimited
                </span>
              )}
            </div>

            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-[38px] font-semibold text-fg tabular-nums leading-none tracking-tight">
                {tier.price}
              </span>
              <span className="text-[13px] text-fg-3">{tier.cadence}</span>
            </div>

            <p className="mt-4 text-[13px] leading-[1.6] text-fg-2 min-h-[66px]">
              {tier.pitch}
            </p>

            <ul className="mt-5 space-y-2.5 text-[13px] text-fg-2">
              {tier.bullets.map((b) => (
                <li key={b} className="flex gap-2.5">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    className="mt-[3px] shrink-0 text-brand"
                    aria-hidden
                  >
                    <path
                      d="M5 12l4 4 10-10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <div className="flex-1" />

            <div className="mt-6">
              {tier.key === "free" ? (
                loading ? null : user ? (
                  <Button
                    variant="outline"
                    className="w-full h-10 rounded-md border-rule bg-surface-3 hover:bg-surface-3/70 text-fg"
                    render={<Link href="/tracks" />}
                  >
                    Go to problems
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full h-10 rounded-md border-rule bg-surface-3 hover:bg-surface-3/70 text-fg"
                    onClick={() => signInWithGoogle().then(() => router.push("/onboarding"))}
                  >
                    {tier.cta}
                  </Button>
                )
              ) : (
                <Button
                  onClick={() => handleUpgrade(tier.key as Plan)}
                  disabled={pending !== null}
                  className={`w-full h-10 rounded-md text-[14px] font-medium ${
                    featured
                      ? "bg-brand text-[#0a0a0a] hover:bg-brand/90"
                      : "bg-surface-3 hover:bg-surface-3/70 text-fg border border-rule"
                  }`}
                >
                  {pending === tier.key ? "Loading…" : tier.cta}
                </Button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
