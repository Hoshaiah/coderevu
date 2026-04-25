"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { signInWithGoogle, signOut } from "@/lib/firebase/client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export function SiteHeader() {
  const { user, loading } = useAuth();
  const router = useRouter();

  async function handleSignIn() {
    try {
      await signInWithGoogle();
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("Sign-in failed");
    }
  }

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-6 px-6">
        {/* left — logo + primary nav */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-grid place-items-center size-7 rounded-md bg-brand text-[#0a0a0a] text-[15px] font-bold">
              C
            </span>
            <span className="text-[15px]">CodeRevu</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-[13.5px]">
            <NavLink href="/tracks">Problems</NavLink>
            <NavLink href="/pricing">Pricing</NavLink>
          </nav>
        </div>

        {/* right — session */}
        <div className="flex items-center gap-4">
          {loading ? (
            <span className="size-8 rounded-full bg-surface-3 animate-pulse" />
          ) : user ? (
            <>
              <div className="hidden sm:flex items-center gap-1.5 text-[12px] text-fg-3">
                <span className="inline-block size-1.5 rounded-full bg-brand" />
                <span>0 solved</span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger className="focus:outline-none rounded-full focus-visible:ring-2 focus-visible:ring-brand">
                  <Avatar className="size-8 ring-1 ring-rule hover:ring-fg-3 transition">
                    <AvatarImage src={user.photoURL ?? undefined} alt={user.displayName ?? ""} />
                    <AvatarFallback className="bg-surface-3 text-fg text-xs font-medium">
                      {user.displayName?.[0]?.toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="min-w-56 border-rule bg-surface-2"
                >
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-[11px] font-normal text-fg-3 px-2 pt-2">
                      {user.email}
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator className="bg-rule" />
                  <DropdownMenuItem render={<Link href="/account" />}>Account</DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/tracks" />}>Problems</DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-rule" />
                  <DropdownMenuItem onClick={handleSignOut}>Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <button
                onClick={handleSignIn}
                className="text-[13.5px] text-fg-2 hover:text-fg transition"
              >
                Sign in
              </button>
              <Button
                onClick={handleSignIn}
                size="sm"
                className="h-8 px-3.5 text-[13px] rounded-md bg-brand text-[#0a0a0a] hover:bg-brand/90"
              >
                Start free
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-fg-2 hover:text-fg hover:bg-surface-2 transition"
    >
      {children}
    </Link>
  );
}
