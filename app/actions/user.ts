"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { setPrimaryTrack } from "@/lib/db/users";
import { isTrackId, type TrackId } from "@/lib/db/types";

export async function chooseTrack(track: string) {
  if (!isTrackId(track)) throw new Error(`Invalid track: ${track}`);
  const session = await requireSession();
  await setPrimaryTrack(session.uid, track as TrackId);
  redirect(`/tracks/${track}`);
}
