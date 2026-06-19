import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getUserDoc } from "@/lib/db/users";
import { TRACK_META } from "@/lib/db/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AccountPage() {
  const session = await getSessionUser();
  if (!session) redirect("/");
  const user = await getUserDoc(session.uid);
  if (!user) redirect("/");

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-14 space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Account</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <Row label="Email" value={user.email} />
          <Row label="Name" value={user.displayName || "—"} />
          <Row
            label="Primary track"
            value={user.primaryTrack ? TRACK_META[user.primaryTrack].label : "Not chosen"}
          />
        </CardContent>
      </Card>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
