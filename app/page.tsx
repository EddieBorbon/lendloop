"use client";

import { SignInButton } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { ArrowRight, Lock, Wrench } from "lucide-react";
import Link from "next/link";
import { formatCategoryLabel } from "@/components/constants";
import { api } from "@/convex/_generated/api";

export default function HomePage() {
  const { isAuthenticated } = useConvexAuth();
  const publicTools = useQuery(api.tools.listPublic, {});

  return (
    <div className="space-y-10">
      {/* Hero section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
        <div className="max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            <Wrench className="h-3.5 w-3.5" />
            <span>Neighborhood Tool Library</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            LendLoop
          </h1>
          <p className="text-xl font-medium text-slate-600">
            Borrow what you need. Lend what you don&apos;t.
          </p>
          <p className="text-sm leading-relaxed text-slate-500">
            Discover tools shared by neighbors in your community. For privacy and
            data minimization, public visitors can browse tool names and
            categories only. Sign in to check real-time availability, see
            trusted lenders, or request a loan.
          </p>

          <div className="pt-2">
            {isAuthenticated ? (
              <Link
                href="/tools"
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                <span>Explore Available Tools</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                >
                  <Lock className="h-4 w-4" />
                  <span>Sign in to lend or borrow</span>
                </button>
              </SignInButton>
            )}
          </div>
        </div>
      </section>

      {/* Public read-only tool directory */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Community Tool Directory (Read-Only Preview)
            </h2>
            <p className="text-xs text-slate-500">
              Showing tool name and category only. Owner identities are hidden
              on public pages.
            </p>
          </div>
        </div>

        {publicTools === undefined ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white p-5"
              />
            ))}
          </div>
        ) : publicTools.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-sm font-medium text-slate-700">
              No tools listed in the catalog yet.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Sign in to be the first neighbor to share a tool!
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {publicTools.map((tool) => (
              <div
                key={tool._id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300"
              >
                <div>
                  <span className="inline-block rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                    {formatCategoryLabel(tool.category)}
                  </span>
                  <h3 className="mt-2.5 text-base font-semibold text-slate-900">
                    {tool.name}
                  </h3>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

