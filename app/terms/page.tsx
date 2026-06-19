export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 prose prose-zinc dark:prose-invert">
      <h1 className="text-3xl font-semibold tracking-tight mb-6">Terms of Service</h1>
      <p className="text-muted-foreground">
        Placeholder terms. Replace with ones appropriate for your deployment.
      </p>
      <ol className="list-decimal pl-5 space-y-3 text-sm text-muted-foreground mt-6">
        <li>Using CodeRevu means agreeing to these terms.</li>
        <li>There are no accounts. Progress is tied to a cookie on your browser.</li>
        <li>AI responses are generated and may be wrong. Always verify before trusting.</li>
        <li>These terms may be updated with reasonable notice.</li>
      </ol>
    </main>
  );
}
