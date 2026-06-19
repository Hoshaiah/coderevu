# CodeRevu

An open-source web app for practicing code review on real broken snippets, with
an AI tutor that probes like a senior reviewer. Ten language tracks
(Python, JS/TS/React, Ruby/Rails, Java, C#, Rust, PHP, Go, Kotlin, Swift) of
hand-authored problems live in `content/`.

## Run it locally

### Prereqs

- Node.js 20+
- pnpm
- A Firebase project (Auth + Firestore)
- An Anthropic API key (for the AI tutor)

### 1. Firebase

1. Create a project at the [Firebase console](https://console.firebase.google.com).
2. **Authentication → Sign-in method**: enable Google.
3. **Build → Firestore Database**: create in native mode.
4. **Project settings → Your apps**: add a web app, copy the config into the `NEXT_PUBLIC_FIREBASE_*` vars.
5. **Project settings → Service accounts**: generate a new private key (JSON). Either save it as `./service-account.json` (gitignored) or paste the values into the `FIREBASE_ADMIN_*` env vars.
6. Deploy the security rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

### 2. Anthropic

Grab a key from the [Anthropic console](https://console.anthropic.com) and set
`ANTHROPIC_API_KEY`.

### 3. Env file

```bash
cp .env.example .env.local
# fill in the values
```

See [`.env.example`](.env.example) for the full list.

### 4. Install, seed, run

```bash
pnpm install
pnpm seed     # imports the problems in content/ into Firestore
pnpm dev      # http://localhost:3000
```

## Stack

- Next.js 16 (App Router, TypeScript strict)
- Firebase Auth (Google) + Firestore (Admin SDK on the server)
- Anthropic API (`claude-haiku-4-5`) for the AI tutor
- Monaco Editor + Tailwind CSS v4 + shadcn/ui (base-ui variant)

## Contributing

PRs welcome — especially new problems.

Each problem lives at `content/<track>/NNN-<slug>/` with two files:

- `problem.md` — frontmatter (`slug`, `track`, `orderIndex`, `title`, `difficulty`,
  `tags`, `language`) plus a `## Context` section and a `## Buggy code` fenced
  code block.
- `solution.md` — a `## Reference solution` fenced code block and a
  `## Explanation` section.

Re-run `pnpm seed` after adding or editing files — it upserts by slug.

Tracks live under: `content/{python,javascript,ruby,java,csharp,rust,php,go,kotlin,swift}/`.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Run the built app |
| `pnpm seed` | Import / refresh problems from `content/**` into Firestore |
| `pnpm lint` | ESLint |

## License

[MIT](./LICENSE)
