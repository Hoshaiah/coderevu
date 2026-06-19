import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-surface/95 backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-6 pl-3 pr-6">
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
          </nav>
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
