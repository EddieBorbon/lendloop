"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Edit2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  formatCategoryLabel,
  formatConditionLabel,
  TOOL_CATEGORIES,
  TOOL_CONDITIONS,
  type ToolCategory,
  type ToolCondition,
} from "@/components/constants";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export default function MyListingsPage() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const listings = useQuery(
    api.tools.myListings,
    isAuthenticated ? {} : "skip"
  );

  const createTool = useMutation(api.tools.create);
  const updateTool = useMutation(api.tools.update);
  const removeTool = useMutation(api.tools.remove);

  const [editingId, setEditingId] = useState<Id<"tools"> | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ToolCategory>("power_tools");
  const [condition, setCondition] = useState<ToolCondition>("good");
  const [description, setDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setEditingId(null);
    setName("");
    setCategory("power_tools");
    setCondition("good");
    setDescription("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    try {
      if (editingId) {
        await updateTool({
          toolId: editingId,
          name,
          category,
          condition,
          description,
        });
      } else {
        await createTool({
          name,
          category,
          condition,
          description,
        });
      }
      resetForm();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to save tool listing."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(toolId: Id<"tools">) {
    setErrorMessage(null);
    try {
      await removeTool({ toolId });
      if (editingId === toolId) {
        resetForm();
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to delete tool."
      );
    }
  }

  if (authLoading || (isAuthenticated && listings === undefined)) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-slate-200" />
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      {/* Create / Edit Form */}
      <div className="lg:col-span-1">
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs"
        >
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Plus className="h-4 w-4 text-indigo-600" />
            <span>{editingId ? "Edit Tool Listing" : "Add a Tool"}</span>
          </h2>

          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {errorMessage}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Tool Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g., DeWalt Orbital Sander"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ToolCategory)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {TOOL_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Condition
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as ToolCondition)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {TOOL_CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Description
            </label>
            <textarea
              rows={3}
              placeholder="Include accessories, voltage, or pickup notes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting
                ? "Saving..."
                : editingId
                  ? "Update Tool"
                  : "Publish Tool"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* My Listings List */}
      <div className="space-y-4 lg:col-span-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Listings</h1>
          <p className="text-sm text-slate-500">
            Manage the tools you share with your neighborhood.
          </p>
        </div>

        {!listings || listings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-sm font-medium text-slate-700">
              You haven&apos;t listed any tools yet.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Use the form on the left to share your first tool!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map((tool) => (
              <div
                key={tool._id}
                className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:flex-row sm:items-center"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {formatCategoryLabel(tool.category)}
                    </span>
                    <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      Condition: {formatConditionLabel(tool.condition)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        tool.available
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {tool.available ? "Available today" : "Currently on loan"}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {tool.name}
                  </h3>
                  {tool.description && (
                    <p className="text-sm text-slate-600">{tool.description}</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(tool._id);
                      setName(tool.name);
                      setCategory(tool.category);
                      setCondition(tool.condition);
                      setDescription(tool.description);
                      setErrorMessage(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(tool._id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

