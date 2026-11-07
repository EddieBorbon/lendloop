import type { Metadata } from "next";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "LendLoop — Borrow what you need. Lend what you don't.",
  description:
    "Community tool lending platform built with Next.js, Clerk, Convex, and signed n8n workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <ConvexClientProvider>
          <Navbar />
          <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            {children}
          </main>
        </ConvexClientProvider>
      </body>
    </html>
  );
}

