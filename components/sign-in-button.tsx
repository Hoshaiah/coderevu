"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/lib/firebase/client";

export function SignInButton({ redirectTo = "/onboarding" }: { redirectTo?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignIn() {
    setPending(true);
    try {
      await signInWithGoogle();
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("Sign-in failed. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button onClick={handleSignIn} disabled={pending} size="lg">
      {pending ? "Signing in..." : "Sign in with Google"}
    </Button>
  );
}
