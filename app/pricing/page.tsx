import { PricingCards } from "@/components/pricing-cards";

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-16">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-muted-foreground mt-3">
          One plan per person. Cap on AI usage so there are no surprises.
        </p>
      </div>
      <PricingCards />
    </main>
  );
}
