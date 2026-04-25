"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { setPrimaryTrack, getUserDoc } from "@/lib/db/users";
import { isTrackId, type TrackId } from "@/lib/db/types";

export async function chooseTrack(track: string) {
  if (!isTrackId(track)) throw new Error(`Invalid track: ${track}`);
  const session = await requireSession();
  const user = await getUserDoc(session.uid);
  const paid =
    user?.subscription.status === "active" || user?.subscription.status === "past_due";
  if (user?.primaryTrack && !paid) {
    throw new Error("Primary track is locked on the free plan.");
  }
  await setPrimaryTrack(session.uid, track as TrackId);
  redirect(`/tracks/${track}`);
}
