export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 prose prose-zinc dark:prose-invert">
      <h1 className="text-3xl font-semibold tracking-tight mb-6">Privacy Policy</h1>
      <p className="text-muted-foreground">
        Placeholder privacy policy. Replace with one appropriate for your deployment.
      </p>
      <ul className="list-disc pl-5 space-y-3 text-sm text-muted-foreground mt-6">
        <li>
          We store your email, name, avatar (from your auth provider), and in-app progress.
        </li>
        <li>
          Your code drafts and chat messages are stored in Firestore to persist your work
          across sessions. They aren&rsquo;t sold or shared with third parties.
        </li>
        <li>
          AI chat messages are sent to the configured model provider (Anthropic by default)
          for generation. They are not used to train models per that provider&rsquo;s API terms.
        </li>
        <li>You can delete your account and all associated data by emailing the operator.</li>
      </ul>
    </main>
  );
}
