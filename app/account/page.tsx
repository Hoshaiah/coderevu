import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getUserDoc } from "@/lib/db/users";
import { TRACK_META } from "@/lib/db/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ManageSubscriptionButton } from "@/components/manage-subscription-button";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function AccountPage() {
  const session = await getSessionUser();
  if (!session) redirect("/");
  const user = await getUserDoc(session.uid);
  if (!user) redirect("/");

  const status = user.subscription.status;
  const statusLabel =
    status === "active"
      ? "Active"
      : status === "past_due"
      ? "Past due"
      : status === "canceled"
      ? "Canceled"
      : "Free";

  const paid = status === "active" || status === "past_due";

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            Subscription
            <Badge variant={paid ? "default" : "secondary"}>{statusLabel}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <Row
            label="Plan"
            value={
              user.subscription.plan === "monthly"
                ? "Monthly — $9.99/mo"
                : user.subscription.plan === "annual"
                ? "Annual — $49.99/yr"
                : "Free"
            }
          />
          <Row
            label="Renews"
            value={
              user.subscription.currentPeriodEnd
                ? user.subscription.currentPeriodEnd.toDate().toLocaleDateString()
                : "—"
            }
          />
          <div className="pt-2">
            {paid ? (
              <ManageSubscriptionButton />
            ) : (
              <Button render={<Link href="/upgrade" />}>Upgrade</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI usage this month</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <Row label="Spent" value={`$${user.aiUsage.spentUsd.toFixed(2)}`} />
          <Row label="Cap" value={`$${user.aiUsage.capUsd.toFixed(2)}`} />
          <Row label="Resets" value={nextResetDate()} />
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

function nextResetDate(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return next.toLocaleDateString();
}
