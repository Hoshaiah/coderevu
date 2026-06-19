# CodeRevu

An open-source web app for practicing code review on real broken snippets, with
an AI tutor that probes like a senior reviewer. Ten language tracks
(Python, JS/TS/React, Ruby/Rails, Java, C#, Rust, PHP, Go, Kotlin, Swift) of
hand-authored problems live in `content/`.

No login. Progress is tracked per-browser via a long-lived cookie and stored in
a self-hosted Postgres instance — no external services required.

## Run it locally

### Prereqs

- Docker + Docker Compose (easiest path), OR
- Node.js 20+ with pnpm and a local Postgres instance you'll point at via
  `DATABASE_URL`.

### 1. Env file

```bash
cp .env.example .env
```

The defaults work as-is with the bundled `docker compose` stack.

To enable the AI tutor, set `ANTHROPIC_API_KEY` to a key from the
[Anthropic console](https://console.anthropic.com). Without a key the tutor
panel shows a "configure to enable" message and the rest of the app works
normally.

### 2. Start it

**With Docker (recommended):**

```bash
docker compose up
```

This spins up Postgres + the Next.js app. The app is at
[http://localhost:3001](http://localhost:3001). Schema is applied
automatically on first request.

**Without Docker:**

```bash
pnpm install
# Point DATABASE_URL at a Postgres you have running locally, then:
pnpm dev    # http://localhost:3000
```

## Stack

- Next.js 16 (App Router, TypeScript strict)
- Postgres (via `pg`), schema in `lib/db/schema.sql`
- Anthropic API (`claude-haiku-4-5`) for the optional AI tutor
- Monaco Editor + Tailwind CSS v4 + shadcn/ui (base-ui variant)

## Contributing

PRs welcome — especially new problems.

Each problem lives at `content/<track>/NNN-<slug>/` with two files:

- `problem.md` — frontmatter (`slug`, `track`, `orderIndex`, `title`, `difficulty`,
  `tags`, `language`) plus a `## Context` section and a `## Buggy code` fenced
  code block.
- `solution.md` — a `## Reference solution` fenced code block and a
  `## Explanation` section.

Problems are read from disk at request time — no seed step needed. Just add a
new directory under `content/<track>/`, hit refresh.

Tracks live under: `content/{python,javascript,ruby,java,csharp,rust,php,go,kotlin,swift}/`.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Run the built app |
| `pnpm lint` | ESLint |

## License

[MIT](./LICENSE)
