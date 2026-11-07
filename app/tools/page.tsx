"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { BadgeCheck, Calendar, CheckCircle2, Filter, XCircle } from "lucide-react";
import { useState } from "react";
import {
  formatCategoryLabel,
  formatConditionLabel,
  TOOL_CATEGORIES,
  type ToolCategory,
} from "@/components/constants";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export default function ToolsPage() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | "all">(
    "all"
  );
  const [activeToolId, setActiveToolId] = useState<Id<"tools"> | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const tools = useQuery(
    api.tools.listAll,
    isAuthenticated
      ? selectedCategory === "all"
        ? {}
        : { category: selectedCategory }
      : "skip"
  );

  const requestLoan = useMutation(api.loans.request);

  const todayIso = new Date().toISOString().slice(0, 10);

  async function handleRequestSubmit(e: React.FormEvent, toolId: Id<"tools">) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!startDate || !endDate) {
      setErrorMessage("Please select both a start date and an end date.");
      return;
    }

    setSubmitting(true);
    try {
      await requestLoan({
        toolId,
        startDate,
        endDate,
      });
      setSuccessMessage("Loan request submitted! The owner has been notified.");
      setActiveToolId(null);
      setStartDate("");
      setEndDate("");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to submit loan request.";
      setErrorMessage(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || (isAuthenticated && tools === undefined)) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-48 animate-pulse rounded-xl border border-slate-200 bg-white p-5"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Community Tools</h1>
          <p className="text-sm text-slate-500">
            Browse tools shared by neighbors, filter by category, and request a
            loan date range.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-500" />
          <select
            aria-label="Filter by category"
            value={selectedCategory}
            onChange={(e) =>
              setSelectedCategory(e.target.value as ToolCategory | "all")
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-xs focus:border-indigo-500 focus:outline-none"
          >
            <option value="all">All Categories</option>
            {TOOL_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      )}

      {!tools || tools.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm font-medium text-slate-700">
            No tools found for this category.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Try switching the category filter or list one of your own tools in
            My Listings.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <div
              key={tool._id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                    {formatCategoryLabel(tool.category)}
                  </span>

                  {tool.available ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Available today
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                      <XCircle className="h-3.5 w-3.5" />
                      Currently on loan
                    </span>
                  )}
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {tool.name}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Condition:{" "}
                    <span className="font-medium text-slate-700">
                      {formatConditionLabel(tool.condition)}
                    </span>
                  </p>
                </div>

                {tool.description && (
                  <p className="text-sm text-slate-600">{tool.description}</p>
                )}

                <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5 text-xs text-slate-600">
                  <span>Owner:</span>
                  <span className="font-semibold text-slate-800">
                    {tool.ownerName}
                  </span>
                  {tool.ownerTrustedLender && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                      <BadgeCheck className="h-3.5 w-3.5 text-indigo-600" />
                      Trusted Lender
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-2">
                {tool.isOwner ? (
                  <span className="block w-full rounded-lg bg-slate-100 px-3 py-2 text-center text-xs font-medium text-slate-500">
                    You own this tool
                  </span>
                ) : activeToolId === tool._id ? (
                  <form
                    onSubmit={(e) => void handleRequestSubmit(e, tool._id)}
                    className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600">
                          Start Date
                        </label>
                        <input
                          type="date"
                          required
                          min={todayIso}
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600">
                          End Date
                        </label>
                        <input
                          type="date"
                          required
                          min={startDate || todayIso}
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="flex-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {submitting ? "Sending..." : "Confirm Request"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveToolId(null)}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveToolId(tool._id);
                      setStartDate(todayIso);
                      setEndDate(todayIso);
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Request to Borrow</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

