export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 prose prose-zinc dark:prose-invert">
      <h1 className="text-3xl font-semibold tracking-tight mb-6">Privacy Policy</h1>
      <p className="text-muted-foreground">
        Placeholder privacy policy. Replace with a real one before launch.
      </p>
      <ul className="list-disc pl-5 space-y-3 text-sm text-muted-foreground mt-6">
        <li>
          We store your email, name, avatar (from Google), subscription status, and in-app progress.
        </li>
        <li>
          Your code drafts and chat messages are stored in Firestore to persist your work and
          metering state. We don't sell them or share them with third parties.
        </li>
        <li>
          Payments are processed by Stripe; we never see your card number.
        </li>
        <li>You can delete your account and all associated data by emailing support.</li>
      </ul>
    </main>
  );
}
