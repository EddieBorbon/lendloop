"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Calendar, XCircle } from "lucide-react";
import { useState } from "react";
import { AutomationActivityList } from "@/components/AutomationActivityList";
import { formatCategoryLabel } from "@/components/constants";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const STATUS_BADGE: Record<string, string> = {
  requested: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  declined: "bg-red-100 text-red-800",
  returned: "bg-slate-200 text-slate-800",
  cancelled: "bg-slate-100 text-slate-500",
};

export default function MyRequestsPage() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const requests = useQuery(
    api.loans.myRequests,
    isAuthenticated ? {} : "skip"
  );
  const cancelLoan = useMutation(api.loans.cancel);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleCancel(loanId: Id<"loans">) {
    setErrorMessage(null);
    try {
      await cancelLoan({ loanId });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to cancel request."
      );
    }
  }

  if (authLoading || (isAuthenticated && requests === undefined)) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        {[1, 2].map((n) => (
          <div
            key={n}
            className="h-36 animate-pulse rounded-xl border border-slate-200 bg-white"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Requests</h1>
        <p className="text-sm text-slate-500">
          Track tools you have requested to borrow and view automated
          notifications.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {!requests || requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm font-medium text-slate-700">
            You haven&apos;t requested any tools yet.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Visit Browse Tools to find something you need!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((loan) => (
            <div
              key={loan._id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
            >
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                        STATUS_BADGE[loan.status] ?? "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {loan.status}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {formatCategoryLabel(loan.toolCategory)}
                    </span>
                  </div>

                  <h2 className="text-lg font-semibold text-slate-900">
                    {loan.toolName}
                  </h2>

                  <p className="text-xs text-slate-600">
                    Owner:{" "}
                    <span className="font-medium text-slate-800">
                      {loan.ownerName}
                    </span>
                  </p>

                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>
                      {loan.startDate} &rarr; {loan.endDate}
                    </span>
                  </div>
                </div>

                {loan.status === "requested" && (
                  <button
                    type="button"
                    onClick={() => void handleCancel(loan._id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span>Cancel Request</span>
                  </button>
                )}
              </div>

              <AutomationActivityList events={loan.automationEvents} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

