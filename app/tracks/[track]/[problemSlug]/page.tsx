import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getUserDoc, isSubscriptionActive, rolloverAiUsageIfNeeded } from "@/lib/db/users";
import { getProblemBySlug, problemId as makeProblemId } from "@/lib/db/problems";
import { getProgress } from "@/lib/db/progress";
import { getConversation } from "@/lib/db/conversations";
import {
  isTrackId,
  isProgressRevealed,
  normalizeProgressStatus,
} from "@/lib/db/types";
import { ProblemWorkspace } from "@/components/problem-workspace";

const FREE_LIMIT = 10;

export default async function ProblemPage(
  props: PageProps<"/tracks/[track]/[problemSlug]">,
) {
  const { track, problemSlug } = await props.params;
  if (!isTrackId(track)) notFound();

  const session = await getSessionUser();
  if (!session) redirect("/");

  let user = await getUserDoc(session.uid);
  if (!user) redirect("/");
  user = await rolloverAiUsageIfNeeded(session.uid, user);

  const problem = await getProblemBySlug(track, problemSlug);
  if (!problem) notFound();

  const paid = isSubscriptionActive(user);
  const isPrimary = user.primaryTrack === track;
  const free = !paid && isPrimary && problem.orderIndex <= FREE_LIMIT;
  if (!paid && !free) redirect("/upgrade");

  const id = makeProblemId(track, problemSlug);
  const progress = await getProgress(session.uid, id);
  const conversation = paid ? await getConversation(session.uid, id) : null;

  return (
    <ProblemWorkspace
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
      chatEnabled={paid}
      initialMessages={
        conversation?.messages.map((m) => ({ role: m.role, content: m.content })) ?? []
      }
      initialSpentUsd={user.aiUsage.spentUsd}
      capUsd={user.aiUsage.capUsd}
    />
  );
}
