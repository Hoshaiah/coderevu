import { notFound } from "next/navigation";
import { getOrCreateSessionId } from "@/lib/db/session";
import {
  getProblemBySlug,
  listTrackProblems,
  problemId as makeProblemId,
} from "@/lib/db/problems";
import { getProgress, listProgressBySlugs } from "@/lib/db/progress";
import { getConversation } from "@/lib/db/conversations";
import {
  isTrackId,
  isProgressRevealed,
  normalizeProgressStatus,
} from "@/lib/db/types";
import { ProblemWorkspace } from "@/components/problem-workspace";

export default async function ProblemPage(
  props: PageProps<"/tracks/[track]/[problemSlug]">,
) {
  const { track, problemSlug } = await props.params;
  if (!isTrackId(track)) notFound();

  const sessionId = await getOrCreateSessionId();

  const problem = getProblemBySlug(track, problemSlug);
  if (!problem) notFound();

  const id = makeProblemId(track, problemSlug);
  const progress = await getProgress(sessionId, id);
  const conversation = await getConversation(sessionId, id);

  // For the in-workspace nav (prev / next / shuffle / list modal).
  // Sort to match the order shown on the track page, and attach each
  // problem's current progress status so the modal can flag complete /
  // in-progress items.
  const difficultyRank = { easy: 0, medium: 1, hard: 2 } as const;
  const sortedTrackProblems = listTrackProblems(track)
    .slice()
    .sort(
      (a, b) =>
        difficultyRank[a.difficulty] - difficultyRank[b.difficulty] ||
        a.orderIndex - b.orderIndex,
    );
  const navProgress = await listProgressBySlugs(
    sessionId,
    sortedTrackProblems.map((p) => makeProblemId(track, p.slug)),
  );
  const navProblems = sortedTrackProblems.map((p) => ({
    slug: p.slug,
    title: p.title,
    difficulty: p.difficulty,
    tags: p.tags,
    status: normalizeProgressStatus(
      navProgress[makeProblemId(track, p.slug)]?.status,
    ),
  }));

  return (
    <ProblemWorkspace
      track={track}
      problemSlug={problemSlug}
      navProblems={navProblems}
      problemId={id}
      title={problem.title}
      difficulty={problem.difficulty}
      tags={problem.tags}
      context={problem.context}
      buggyCode={problem.buggyCode}
      referenceSolution={problem.referenceSolution}
      explanation={problem.explanation}
      language={problem.language}
      initiallyRevealed={isProgressRevealed(progress)}
      initialStatus={normalizeProgressStatus(progress?.status)}
      initialDraft={progress?.draftCode ?? problem.buggyCode}
      initialMessages={
        conversation?.messages.map((m) => ({ role: m.role, content: m.content })) ?? []
      }
      aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
    />
  );
}
