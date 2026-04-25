# PRD — Code Review Practice App

> **Prompt for implementation:** Build the following product as a Next.js (App Router) application. Implement every section below. Where a decision is not explicitly specified, default to the simplest reasonable option and note it in code comments. Do not scaffold until you have read this whole document.

---

## 1. Product summary

A web app where developers practice **code review skills** by working through broken/suboptimal code snippets and discussing them with an AI tutor. Modeled after the file-based problems in this repo (see `001-order-notifications/problem.rb`): each problem presents real-world-looking code with issues (performance, correctness, race conditions, error handling, etc.), and the user identifies the issues, proposes a fix, and chats with AI for guidance.

Content library: **10 tracks × 100 problems = 1,000 problems** at launch.

---

## 2. Goals & non-goals

### Goals
- Let users practice code review in the language/framework they care about.
- Provide a low-friction free tier to prove value before paywall.
- Monetize via subscription with a built-in AI cost ceiling.
- Ship fast: pre-authored content, standard auth/payment stacks, no code execution sandbox.

### Non-goals (v1)
- No code execution or test running. Users edit code in the browser but nothing runs.
- No automated grading. The AI chat is the feedback mechanism.
- No social features (leaderboards, sharing, comments).
- No mobile app.
- No language/content translation — problems are authored once per track.

---

## 3. Tech stack (fixed)

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, Server Components, Server Actions) |
| Hosting | Vercel |
| Auth | Firebase Authentication (Google provider only) |
| Database | Firestore (native mode) |
| Payments | Stripe (Subscriptions + Customer Portal) |
| AI | Anthropic API, model `claude-haiku-4-5` |
| Editor | Monaco Editor (`@monaco-editor/react`) |
| Styling | Tailwind CSS + shadcn/ui |
| Language | TypeScript (strict) |

---

## 4. Tracks (content categories)

Ship with these 10 tracks. Each is a self-contained library of 100 problems.

1. Python
2. JavaScript
3. React
4. Ruby
5. Rails
6. Java
7. C#
8. Rust
9. PHP
10. Go

Note: React and Rails are frameworks, not languages, but are treated as first-class tracks for marketing/UX. Internally use the term **"track"** throughout the schema and UI.

---

## 5. User personas

- **Casual learner** — wants to sharpen skills, tries the free 10 problems.
- **Serious practitioner** — subscribed, works through problems in their main stack, uses AI heavily.
- **Interview prepper** — subscribed, samples multiple tracks, focused on senior-level review patterns.

---

## 6. Tiers

### Free
- One **locked** track chosen on first signup (cannot be changed without upgrading).
- Access to **10 problems** in that track (the 10 lowest-difficulty problems, in seeded order).
- Read problem + edit code in Monaco editor (local state only; optionally persisted to Firestore).
- **No AI chat.** AI panel is visible but disabled with an upgrade CTA.
- Can view reference solution + explanation after clicking "Reveal solution."

### Paid
- All 1,000 problems unlocked across all 10 tracks.
- AI chat enabled on every problem, metered (see §10).
- Progress tracking (started / solved / revealed).
- Pricing:
  - **$9.99 / month**
  - **$49.99 / year** (~58% savings, displayed as "Save $70/yr" in UI)
- Managed via Stripe Customer Portal (cancel, update card, switch plans).

---

## 7. Core user flows

### 7.1 Onboarding
1. Landing page → "Sign in with Google" (Firebase Auth popup).
2. First-time users: select primary track from a picker → saved as `primaryTrack` on user doc → this becomes their free-tier track.
3. Redirect to `/tracks/:track` showing the 10 free problems.

### 7.2 Problem page (`/tracks/:track/:problemSlug`)
Three-pane layout on desktop (stacked on mobile):

```
┌────────────────┬────────────────┬────────────────┐
│  Problem       │  Editor        │  AI Chat       │
│  - Title       │  (Monaco)      │  (paid only;   │
│  - Context     │  pre-filled    │   upgrade CTA  │
│  - Buggy code  │  with buggy    │   for free)    │
│  - Tags,       │  code, user    │                │
│    difficulty  │  edits freely  │  Credits left: │
│                │                │  $3.42 / $4.00 │
│  [Reveal       │  [Save draft]  │                │
│   solution]    │                │                │
└────────────────┴────────────────┴────────────────┘
```

- Editor language mode matches the track.
- Drafts auto-save to Firestore keyed by `(userId, problemId)`.
- AI chat is scoped per problem — each problem has its own conversation thread.
- "Reveal solution" shows the reference solution + explanation below the editor.

### 7.3 Upgrade
- Any paywall surface (locked problem tile, disabled AI panel, "switch track" action) → `/upgrade`.
- `/upgrade` shows monthly vs annual toggle, creates a Stripe Checkout Session, redirects to Stripe.
- Stripe webhook on success → flips `user.subscription.status = "active"` and sets `plan` + `renewsAt`.

### 7.4 Manage subscription
- `/account` → "Manage subscription" → Stripe Customer Portal session.
- Webhooks handle downgrades, cancellations, renewals, failed payments.

---

## 8. Data model (Firestore)

All writes go through server actions / API routes with Firebase Admin SDK. Client SDK is used only for auth state.

### `users/{userId}`
```ts
{
  email: string
  displayName: string
  photoURL: string
  primaryTrack: TrackId           // locked on first choice unless paid
  createdAt: Timestamp
  subscription: {
    status: "none" | "active" | "past_due" | "canceled"
    plan: "monthly" | "annual" | null
    stripeCustomerId: string | null
    stripeSubscriptionId: string | null
    currentPeriodEnd: Timestamp | null
  }
  aiUsage: {
    periodStart: Timestamp        // rolls over monthly, independent of billing cycle
    spentUsd: number              // reset to 0 each period
    capUsd: number                // default 4.00
  }
}
```

### `problems/{problemId}`
Seeded from repo files (see §11). Read-only at runtime.
```ts
{
  slug: string                    // e.g. "order-notifications"
  track: TrackId
  orderIndex: number              // 1..100 per track; free tier gets orderIndex 1..10
  title: string
  difficulty: "easy" | "medium" | "hard"
  tags: string[]                  // e.g. ["n+1", "transactions", "background-jobs"]
  context: string                 // markdown
  buggyCode: string               // the snippet under review
  referenceSolution: string
  explanation: string             // markdown, what was wrong and why the fix is better
  createdAt: Timestamp
}
```

### `users/{userId}/progress/{problemId}`
```ts
{
  status: "started" | "revealed" | "solved"
  draftCode: string | null
  startedAt: Timestamp
  updatedAt: Timestamp
}
```

### `users/{userId}/conversations/{problemId}`
```ts
{
  messages: Array<{
    role: "user" | "assistant"
    content: string
    tokensIn?: number
    tokensOut?: number
    costUsd?: number
    createdAt: Timestamp
  }>
  totalCostUsd: number
  updatedAt: Timestamp
}
```

### `usageEvents/{eventId}` (flat collection, for audit)
```ts
{
  userId: string
  problemId: string
  model: "claude-haiku-4-5"
  tokensIn: number
  tokensOut: number
  costUsd: number
  createdAt: Timestamp
}
```

### Firestore security rules
- Users can read/write only their own `users/{uid}` doc and subcollections.
- `problems/*` is world-readable (no auth required for marketing pages).
- `usageEvents/*` is writable only by the server (Admin SDK).

---

## 9. Routes

### Public
- `/` — marketing landing, pricing, sample problem preview
- `/pricing`
- `/tracks` — list of 10 tracks (locked state shown to signed-out users)

### Authenticated
- `/onboarding` — track picker (first-time only)
- `/tracks/:track` — problem list for a track (free problems unlocked for user's primary track; others locked)
- `/tracks/:track/:problemSlug` — problem page (§7.2)
- `/account` — profile + "Manage subscription" button
- `/upgrade` — pricing + Stripe Checkout launcher

### API / server
- `POST /api/ai/chat` — streams Claude response, meters tokens, enforces cap
- `POST /api/stripe/create-checkout` — returns Checkout URL
- `POST /api/stripe/create-portal` — returns Customer Portal URL
- `POST /api/stripe/webhook` — handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

---

## 10. AI chat metering

### Model & pricing (as of spec date)
- Model: `claude-haiku-4-5`
- Assume ~$1.00 per 1M input tokens, ~$5.00 per 1M output tokens. **Pull live pricing from a constants file** so it's easy to update.

### Cap
- **$4.00 per calendar month, per paid user.**
- Resets on the 1st of each month in the user's `aiUsage.periodStart` bucket — independent of Stripe billing cycle.
- Annual subscribers get the same $4/mo (not $48/yr lump). Rationale: prevents one month of heavy use from blowing the yearly budget.
- **No rollover.** Unused credits expire.
- Non-paid users cannot call the endpoint at all (gated server-side).

### Flow per chat message
1. Server verifies subscription is active.
2. Server reads `user.aiUsage.spentUsd`; if ≥ `capUsd`, return 402-style error: "Monthly AI budget reached."
3. Server calls Anthropic API with streaming. System prompt includes the problem's context + buggy code + (if revealed) reference solution. User's current editor draft is included if present.
4. On response completion, compute `costUsd = tokensIn * $in_rate + tokensOut * $out_rate`.
5. Atomically increment `aiUsage.spentUsd`. Write a `usageEvents` doc. Append message to conversation doc.
6. If post-increment spend would exceed cap mid-stream, allow the in-flight message to finish but block the next one (simpler than hard-killing a stream).

### UI
- Persistent "Credits: $X.XX / $4.00" meter on problem page.
- At 80% spend, show an amber warning. At 100%, show a friendly "You've used this month's AI budget — resets {date}" state with chat disabled.

### System prompt (sketch)
```
You are a senior engineer helping a developer review code. The user is looking
at the following problem:

Title: {title}
Context: {context}
Buggy code:
```{language}
{buggyCode}
```
User's current draft (may be empty):
```{language}
{draftCode}
```
{if revealed}Reference solution:
```{language}
{referenceSolution}
```
Explanation: {explanation}{/if}

Rules:
- Socratic first. Ask a probing question before giving the answer unless the user explicitly asks "just tell me."
- Point to specific lines when discussing bugs.
- Do not invent language features. If unsure, say so.
- Stay scoped to this problem. Decline unrelated requests politely.
```

---

## 11. Content authoring workflow

Problems live as files in the repo, one directory per problem, mirroring the current `001-order-notifications/` pattern.

### File layout
```
content/
  python/
    001-leaky-context-manager/
      problem.md          # frontmatter + context + buggy code block
      solution.md         # reference solution + explanation
    002-.../
  javascript/
    001-.../
  ...
```

### `problem.md` frontmatter
```yaml
---
slug: leaky-context-manager
track: python
orderIndex: 1
title: "File handle leaked when exception is raised mid-read"
difficulty: easy
tags: [resource-management, exceptions]
language: python  # for Monaco syntax highlighting
---
```

### Seed script
- `scripts/seed-problems.ts` — reads `content/**`, validates frontmatter, upserts into Firestore by slug.
- Runs manually (`pnpm seed`) and as a Vercel deploy hook.
- Idempotent — re-running on existing problems updates fields, does not duplicate.

### Authoring checklist per problem
- [ ] Realistic bug (not a toy example)
- [ ] 1–3 distinct issues worth discussing
- [ ] Reference solution compiles/parses (manually verified)
- [ ] Explanation explains **why**, not just **what**

---

## 12. Analytics / success metrics

Track via PostHog or Vercel Analytics + a Firestore `events` collection:

- Signup → first problem opened (activation)
- Free problems completed (of 10)
- Free → Paid conversion rate (overall, by primary track)
- Monthly AI spend distribution (are users hitting the $4 cap? bunching at low end?)
- Churn by plan
- Problems with highest "reveal solution without trying" rate → candidates for rework

---

## 13. Out of scope for v1 (note but do not build)

- Code execution / test cases
- User-submitted problems
- Teams / organizations
- Non-Google auth providers
- Email (beyond transactional via Stripe; no marketing)
- i18n

---

## 14. Open decisions to confirm during build

Default answers provided; flag to user if changed:

- **Credit rollover:** no rollover (monthly reset).
- **Annual credits:** same $4/mo meter, not a $48 lump.
- **Primary track switch:** paid users can change `primaryTrack` freely (purely cosmetic since they have access to all). Free users cannot switch without upgrading.
- **Reveal solution before attempting:** allowed, but marks progress as `revealed` not `solved`.
- **Sign-out:** standard Firebase sign-out, no special handling.
- **Legal:** stub `/terms` and `/privacy` pages with placeholder copy for launch.

---

## 15. Build order (suggested)

1. Next.js scaffold + Tailwind + shadcn/ui + Firebase Auth (Google sign-in only)
2. Firestore schema + security rules + Admin SDK setup on server
3. Content folder + 1 seed problem per track + seed script
4. Tracks list page + problem page (no AI, no payments yet)
5. Monaco editor + draft persistence
6. Stripe Checkout + webhooks + subscription gating
7. Anthropic streaming chat + token metering + credit cap UI
8. Polish: landing, pricing, account page, Customer Portal
9. Author remaining ~990 problems (can run in parallel with 1–8)
10. Analytics, error monitoring (Sentry), launch
