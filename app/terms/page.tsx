export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 prose prose-zinc dark:prose-invert">
      <h1 className="text-3xl font-semibold tracking-tight mb-6">Terms of Service</h1>
      <p className="text-muted-foreground">
        These are placeholder terms for CodeRevu. Replace with real terms before launch.
      </p>
      <ol className="list-decimal pl-5 space-y-3 text-sm text-muted-foreground mt-6">
        <li>Using CodeRevu means agreeing to these terms.</li>
        <li>Accounts are tied to a Google identity. Keep your credentials safe.</li>
        <li>
          Subscriptions renew automatically until canceled. Cancel any time from the account page.
        </li>
        <li>AI responses are generated and may be wrong. Always verify before trusting.</li>
        <li>We may update these terms with reasonable notice.</li>
      </ol>
    </main>
  );
}
