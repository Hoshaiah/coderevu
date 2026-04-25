# CodeRevu

A web app where developers practice code review by working through broken, real-world code and pairing with an AI tutor. 10 tracks × 100 problems = 1,000 problems at launch.

See `PRD.md` for the full product spec.

## Stack

- Next.js 16 (App Router, Turbopack, TypeScript strict)
- Firebase Auth (Google) + Firestore (Admin SDK on server)
- Stripe Subscriptions (monthly + annual, with Customer Portal)
- Anthropic API (`claude-haiku-4-5`) with per-user monthly spend cap
- Monaco Editor + Tailwind CSS v4 + shadcn/ui (base-ui variant)

## Setup

### 1. Firebase

1. Create a project in the [Firebase console](https://console.firebase.google.com).
2. **Authentication → Sign-in method**: enable Google.
3. **Build → Firestore Database**: create in native mode, pick a region.
4. **Project settings → Your apps**: add a web app, copy the config into the `NEXT_PUBLIC_FIREBASE_*` vars in `.env.local`.
5. **Project settings → Service accounts**: generate a new private key (JSON). Put the values into:
   - `FIREBASE_ADMIN_PROJECT_ID` = `project_id`
   - `FIREBASE_ADMIN_CLIENT_EMAIL` = `client_email`
   - `FIREBASE_ADMIN_PRIVATE_KEY` = `private_key` (keep the `\n` escapes; the code un-escapes them)
6. Deploy the security rules:
   ```bash
   firebase deploy --only firestore:rules
   ```
   (or paste `firestore.rules` into the Firestore rules editor).

### 2. Stripe

1. Create products in the [Stripe dashboard](https://dashboard.stripe.com/test/products):
   - **CodeRevu Monthly** — recurring $9.99/mo
   - **CodeRevu Annual** — recurring $49.99/yr
2. Copy each price ID into `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL`.
3. Set `STRIPE_SECRET_KEY` (test key for dev).
4. For the webhook, in dev run `stripe listen --forward-to localhost:3000/api/stripe/webhook` — it prints the signing secret. Set `STRIPE_WEBHOOK_SECRET` to that value.
5. In prod, add an endpoint `https://your-domain/api/stripe/webhook` listening for:
   - `checkout.session.completed`
   - `customer.subscription.created` / `updated` / `deleted`
   - `invoice.payment_failed`

### 3. Anthropic

Grab a key from the [Anthropic console](https://console.anthropic.com) and set `ANTHROPIC_API_KEY`.

### 4. Env file

```bash
cp .env.example .env.local
# then fill in the values
```

### 5. Install + seed + run

```bash
pnpm install
pnpm seed         # imports the 10 seed problems (1 per track) into Firestore
pnpm dev          # http://localhost:3000
```

## Authoring more problems

1. Add a directory under `content/<track>/NNN-<slug>/` with `problem.md` and `solution.md`.
2. `problem.md` frontmatter:
   ```yaml
   ---
   slug: <slug>
   track: <track>        # one of: python, javascript, react, ruby, rails, java, csharp, rust, php, go
   orderIndex: <1..100>  # free tier gets orderIndex 1..10 on the primary track
   title: "..."
   difficulty: easy | medium | hard
   tags: [...]
   language: python      # Monaco language id
   ---
   ```
3. Body structure:
   - `## Context` — markdown narrative
   - `## Buggy code` — a fenced code block
4. `solution.md` body structure:
   - `## Reference solution` — a fenced code block
   - `## Explanation` — markdown narrative
5. Re-run `pnpm seed` (idempotent — upserts by slug).

## Deploying

Vercel is the path of least resistance.

1. Push to a Git repo and import into Vercel.
2. Set all env vars from `.env.example` in the Vercel project settings.
3. Set `NEXT_PUBLIC_APP_URL` to your production URL (used as Stripe Checkout success/cancel base).
4. Add a [deploy hook](https://vercel.com/docs/deployments/deploy-hooks) that runs `pnpm seed` if you want the seed script to run on deploy. Alternatively run it locally against prod credentials.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the dev server on port 3000 (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Run the built app |
| `pnpm seed` | Import / refresh problems from `content/**` into Firestore |
| `pnpm lint` | ESLint |
