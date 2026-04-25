import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getUserDoc } from "@/lib/db/users";
import { TRACK_IDS, TRACK_META } from "@/lib/db/types";
import { chooseTrack } from "@/app/actions/user";
import { Button } from "@/components/ui/button";

export default async function OnboardingPage() {
  const session = await getSessionUser();
  if (!session) redirect("/");
  const user = await getUserDoc(session.uid);
  const paid =
    user?.subscription.status === "active" || user?.subscription.status === "past_due";
  if (user?.primaryTrack && !paid) {
    redirect(`/tracks/${user.primaryTrack}`);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Pick your primary track</h1>
        <p className="text-muted-foreground mt-3">
          Free tier gets 10 problems in one track. You can upgrade later to unlock them all.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TRACK_IDS.map((t) => (
          <form key={t} action={chooseTrack.bind(null, t)}>
            <Button type="submit" variant="outline" className="w-full h-auto py-4 flex flex-col items-start gap-1">
              <span className="font-medium">{TRACK_META[t].label}</span>
              <span className="text-xs text-muted-foreground font-normal text-left">
                {TRACK_META[t].blurb}
              </span>
            </Button>
          </form>
        ))}
      </div>
    </main>
  );
}
