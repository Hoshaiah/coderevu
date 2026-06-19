import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CodeRevu — Code review practice for mid-level engineers",
  description:
    "A thousand broken snippets across ten languages. For engineers who ship fine but want to review the way seniors do — and stop feeling behind in the fundamentals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrains.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-surface text-fg">
        <SiteHeader />
        <div className="flex-1 flex flex-col">{children}</div>
        <Toaster richColors position="top-center" theme="dark" />
      </body>
    </html>
  );
}
