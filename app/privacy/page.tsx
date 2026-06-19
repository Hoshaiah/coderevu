export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 prose prose-zinc dark:prose-invert">
      <h1 className="text-3xl font-semibold tracking-tight mb-6">Privacy Policy</h1>
      <p className="text-muted-foreground">
        Placeholder privacy policy. Replace with one appropriate for your deployment.
      </p>
      <ul className="list-disc pl-5 space-y-3 text-sm text-muted-foreground mt-6">
        <li>
          CodeRevu does not require an account. A long-lived cookie
          (<code>coderevu_session</code>) ties your progress to this browser.
          Clearing it starts a fresh, unlinked session.
        </li>
        <li>
          Your code drafts and chat messages are stored in the operator&rsquo;s self-hosted
          Postgres instance so your work persists across visits. Nothing is sold or
          shared with third parties.
        </li>
        <li>
          AI chat messages are sent to the configured model provider (Anthropic by default)
          for generation. They are not used to train models per that provider&rsquo;s API terms.
        </li>
        <li>
          You can purge all of your data by clearing the <code>coderevu_session</code> cookie
          (no future request can re-identify it) or by asking the operator to delete the rows.
        </li>
      </ul>
    </main>
  );
}
