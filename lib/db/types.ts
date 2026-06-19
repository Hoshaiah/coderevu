export const TRACK_IDS = [
  "python",
  "javascript",
  "ruby",
  "java",
  "csharp",
  "rust",
  "php",
  "go",
  "kotlin",
  "swift",
] as const;

export type TrackId = (typeof TRACK_IDS)[number];

export const TRACK_META: Record<
  TrackId,
  {
    label: string;
    monacoLanguage: string;
    blurb: string;
    topics: readonly string[];
    brand: string; // hex for per-language accents
    // Optional icon override. Defaults to `${track}.svg`. Use when a combined
    // track wants to display a sibling language's logo (e.g. javascript shows
    // the React atom because the track bundles JS/TS/React).
    iconFile?: string;
  }
> = {
  python: {
    label: "Python",
    monacoLanguage: "python",
    blurb: "Pythonic pitfalls and performance traps.",
    topics: ["resource-management", "concurrency", "correctness", "perf"],
    brand: "#4584b6",
  },
  javascript: {
    label: "React, JavaScript, TypeScript",
    monacoLanguage: "typescript",
    blurb: "JS gotchas, TS type holes, React hooks and rendering bugs.",
    topics: ["async", "closures", "types", "hooks", "state", "security"],
    brand: "#61dafb",
    iconFile: "react.svg",
  },
  ruby: {
    label: "Ruby & Rails",
    monacoLanguage: "ruby",
    blurb: "Pure Ruby idioms plus Rails — ActiveRecord, transactions, N+1, jobs.",
    topics: ["idioms", "mutability", "active-record", "n+1", "security", "concurrency"],
    brand: "#cc342d",
  },
  java: {
    label: "Java",
    monacoLanguage: "java",
    blurb: "Concurrency, nulls, collections.",
    topics: ["concurrency", "collections", "nulls", "exceptions"],
    brand: "#f89820",
  },
  csharp: {
    label: "C#",
    monacoLanguage: "csharp",
    blurb: "Async, LINQ, disposal, cancellation.",
    topics: ["async", "disposal", "linq", "cancellation"],
    brand: "#a179dc",
  },
  rust: {
    label: "Rust",
    monacoLanguage: "rust",
    blurb: "Borrowing, lifetimes, error handling.",
    topics: ["borrowing", "lifetimes", "ownership", "errors"],
    brand: "#dea584",
  },
  php: {
    label: "PHP",
    monacoLanguage: "php",
    blurb: "Sessions, queries, type juggling.",
    topics: ["security", "sessions", "queries", "type-coercion"],
    brand: "#777bb3",
  },
  go: {
    label: "Go",
    monacoLanguage: "go",
    blurb: "Goroutines, channels, errors, context.",
    topics: ["goroutines", "channels", "errors", "context"],
    brand: "#00add8",
  },
  kotlin: {
    label: "Kotlin",
    monacoLanguage: "kotlin",
    blurb: "Coroutines, null-safety, JVM interop, Android lifecycle.",
    topics: ["coroutines", "nullability", "collections", "android"],
    brand: "#7f52ff",
  },
  swift: {
    label: "Swift",
    monacoLanguage: "swift",
    blurb: "Optionals, reference cycles, concurrency, SwiftUI state.",
    topics: ["optionals", "memory", "concurrency", "swiftui"],
    brand: "#f05138",
  },
};

export function isTrackId(value: string): value is TrackId {
  return (TRACK_IDS as readonly string[]).includes(value);
}

export type Difficulty = "easy" | "medium" | "hard";

export type ProblemDoc = {
  slug: string;
  track: TrackId;
  orderIndex: number;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  language: string;
  context: string;
  buggyCode: string;
  referenceSolution: string;
  explanation: string;
};

export type ProgressStatus = "todo" | "in-progress" | "complete";

export type ProgressDoc = {
  status: ProgressStatus;
  revealed: boolean;
  draftCode: string | null;
  startedAt: Date;
  updatedAt: Date;
};

// Postgres only stores the three canonical states. Kept as a function so
// callers can pass `undefined` (no row yet) and get a sane default.
export function normalizeProgressStatus(
  status: ProgressStatus | undefined,
): ProgressStatus {
  if (status === "complete") return "complete";
  if (status === "in-progress") return "in-progress";
  return "todo";
}

export function isProgressRevealed(doc: ProgressDoc | null | undefined): boolean {
  return doc?.revealed === true;
}

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  createdAt: string; // ISO string — stored in jsonb, easier than parsing Date
};

export type ConversationDoc = {
  messages: ChatMessage[];
  updatedAt: Date;
};
