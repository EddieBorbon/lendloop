"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { BadgeCheck, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { AutomationActivityList } from "@/components/AutomationActivityList";
import { formatCategoryLabel } from "@/components/constants";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export default function AdminPage() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const currentUser = useQuery(
    api.users.me,
    isAuthenticated ? {} : "skip"
  );

  const isAdmin = currentUser?.role === "admin";

  const allLoans = useQuery(
    api.admin.allLoans,
    isAuthenticated && isAdmin ? {} : "skip"
  );
  const allUsers = useQuery(
    api.admin.listUsers,
    isAuthenticated && isAdmin ? {} : "skip"
  );
  const allTools = useQuery(
    api.tools.listAll,
    isAuthenticated && isAdmin ? {} : "skip"
  );

  const removeListing = useMutation(api.admin.removeListing);
  const setTrustedLender = useMutation(api.admin.setTrustedLender);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (authLoading || (isAuthenticated && currentUser === undefined)) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-red-600" />
        <h1 className="mt-2 text-lg font-bold text-red-900">
          Administrator Access Required
        </h1>
        <p className="mt-1 text-xs text-red-700">
          This route is restricted to users whose email is listed in
          ADMIN_EMAILS. All admin mutations and queries are also enforced on the
          Convex backend.
        </p>
      </div>
    );
  }

  async function handleRemoveTool(toolId: Id<"tools">) {
    setErrorMessage(null);
    try {
      await removeListing({ toolId });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to remove listing."
      );
    }
  }

  async function handleToggleTrusted(userId: Id<"users">, trusted: boolean) {
    setErrorMessage(null);
    try {
      await setTrustedLender({ userId, trusted });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to update Trusted Lender."
      );
    }
  }

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Admin Control Panel
          </h1>
          <p className="text-sm text-slate-500">
            Moderate tool listings, manage Trusted Lender badges, and inspect
            platform-wide loans and automation events.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Users & Trusted Lender Management */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">
          Community Members &amp; Trusted Lenders
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          {!allUsers || allUsers.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No users registered.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {allUsers.map((u) => (
                <div
                  key={u._id}
                  className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {u.name}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {u.role}
                      </span>
                      {u.trustedLender && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                          <BadgeCheck className="h-3.5 w-3.5" />
                          Trusted Lender
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void handleToggleTrusted(u._id, !u.trustedLender)
                    }
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      u.trustedLender
                        ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        : "bg-indigo-600 text-white hover:bg-indigo-700"
                    }`}
                  >
                    {u.trustedLender
                      ? "Revoke Trusted Lender"
                      : "Grant Trusted Lender"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Moderate Tool Listings */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">
          All Tool Listings ({allTools?.length ?? 0})
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          {!allTools || allTools.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No tools listed.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {allTools.map((tool) => (
                <div
                  key={tool._id}
                  className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {tool.name}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {formatCategoryLabel(tool.category)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Owner: {tool.ownerName}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleRemoveTool(tool._id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove Listing</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* All Platform Loans */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">
          All Platform Loans ({allLoans?.length ?? 0})
        </h2>
        {!allLoans || allLoans.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No loans recorded on the platform yet.
          </div>
        ) : (
          <div className="space-y-3">
            {allLoans.map((loan) => (
              <div
                key={loan._id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase text-slate-700">
                      {loan.status}
                    </span>
                    <h3 className="mt-1 text-base font-semibold text-slate-900">
                      {loan.toolName}
                    </h3>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p>
                      {loan.startDate} &rarr; {loan.endDate}
                    </p>
                    <p>
                      Owner: {loan.ownerName} | Borrower: {loan.borrowerName}
                    </p>
                  </div>
                </div>

                <AutomationActivityList events={loan.automationEvents} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

