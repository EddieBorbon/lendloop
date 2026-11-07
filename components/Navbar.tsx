"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/convex/_generated/api";

export function Navbar() {
  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();
  const currentUser = useQuery(
    api.users.me,
    isAuthenticated ? {} : "skip"
  );

  const navLinks = [
    { href: "/tools", label: "Browse Tools" },
    { href: "/my/listings", label: "My Listings" },
    { href: "/my/requests", label: "My Requests" },
    { href: "/incoming", label: "Incoming Requests" },
  ];

  if (currentUser?.role === "admin") {
    navLinks.push({ href: "/admin", label: "Admin" });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Wrench className="h-4 w-4" />
            </span>
            <span>LendLoop</span>
          </Link>

          {isAuthenticated && (
            <nav className="hidden items-center gap-1 md:flex">
              {navLinks.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              {currentUser?.role === "admin" && (
                <span className="hidden items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 sm:inline-flex">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Admin
                </span>
              )}
              <UserButton afterSignOutUrl="/" />
            </>
          ) : (
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
              >
                Sign in to lend or borrow
              </button>
            </SignInButton>
          )}
        </div>
      </div>

      {isAuthenticated && (
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden">
          {navLinks.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium ${
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}

