import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { ChatMessage, ConversationDoc } from "@/lib/db/types";

function convRef(uid: string, problemId: string) {
  return adminDb().collection("users").doc(uid).collection("conversations").doc(problemId);
}

export async function getConversation(
  uid: string,
  problemId: string,
): Promise<ConversationDoc | null> {
  const snap = await convRef(uid, problemId).get();
  return snap.exists ? (snap.data() as ConversationDoc) : null;
}

export async function appendMessages(
  uid: string,
  problemId: string,
  messages: ChatMessage[],
  costDelta: number,
): Promise<void> {
  const ref = convRef(uid, problemId);
  const snap = await ref.get();
  if (!snap.exists) {
    const doc: ConversationDoc = {
      messages,
      totalCostUsd: costDelta,
      updatedAt: Timestamp.now(),
    };
    await ref.set(doc);
    return;
  }
  await ref.update({
    messages: FieldValue.arrayUnion(...messages),
    totalCostUsd: FieldValue.increment(costDelta),
    updatedAt: Timestamp.now(),
  });
}

export async function clearConversation(
  uid: string,
  problemId: string,
): Promise<void> {
  // Soft-clear: keep the doc but empty the messages array. Preserves the
  // running totalCostUsd so the user's monthly meter and history accounting
  // is unaffected by a chat reset.
  await convRef(uid, problemId).set(
    {
      messages: [],
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
}

export async function recordUsageEvent(input: {
  userId: string;
  problemId: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}): Promise<void> {
  await adminDb()
    .collection("usageEvents")
    .add({ ...input, createdAt: Timestamp.now() });
}
