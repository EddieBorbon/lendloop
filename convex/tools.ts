import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { dateOverlapsDay, getTodayIsoDate } from "./lib/dates";
import { toolCategoryValidator, toolConditionValidator } from "./schema";

async function isToolAvailableToday(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  todayIso: string
): Promise<boolean> {
  const approvedLoans = await ctx.db
    .query("loans")
    .withIndex("by_tool", (q) => q.eq("toolId", toolId))
    .collect();

  return !approvedLoans.some(
    (loan) =>
      loan.status === "approved" &&
      dateOverlapsDay(loan.startDate, loan.endDate, todayIso)
  );
}

/**
 * Public read-only listing for unauthenticated visitors on `/`.
 * Strictly enforces data minimization: returns ONLY `{ _id, name, category }`.
 * Never exposes `ownerId`, owner details, description, or condition.
 */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db.query("tools").order("desc").collect();
    return tools.map((tool) => ({
      _id: tool._id,
      name: tool.name,
      category: tool.category,
    }));
  },
});

/**
 * Authenticated listing of all community tools with calculated availability
 * and owner display info (`ownerName`, `ownerTrustedLender`).
 */
export const listAll = query({
  args: {
    category: v.optional(toolCategoryValidator),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);
    const todayIso = getTodayIsoDate();

    const tools = args.category
      ? await ctx.db
          .query("tools")
          .withIndex("by_category", (q) => q.eq("category", args.category!))
          .order("desc")
          .collect()
      : await ctx.db.query("tools").order("desc").collect();

    const enriched = await Promise.all(
      tools.map(async (tool) => {
        const [owner, available] = await Promise.all([
          ctx.db.get(tool.ownerId),
          isToolAvailableToday(ctx, tool._id, todayIso),
        ]);

        return {
          _id: tool._id,
          ownerId: tool.ownerId,
          name: tool.name,
          category: tool.category,
          condition: tool.condition,
          description: tool.description,
          createdAt: tool.createdAt,
          available,
          isOwner: tool.ownerId === currentUser._id,
          ownerName: owner?.name ?? "Community Member",
          ownerTrustedLender: owner?.trustedLender ?? false,
        };
      })
    );

    return enriched;
  },
});

/**
 * Returns only the tools owned by the currently authenticated user.
 */
export const myListings = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const todayIso = getTodayIsoDate();

    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .collect();

    return await Promise.all(
      tools.map(async (tool) => ({
        ...tool,
        available: await isToolAvailableToday(ctx, tool._id, todayIso),
      }))
    );
  },
});

/**
 * Creates a new tool listing owned by the authenticated user.
 */
export const create = mutation({
  args: {
    name: v.string(),
    category: toolCategoryValidator,
    condition: toolConditionValidator,
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const trimmedName = args.name.trim();
    const trimmedDescription = args.description.trim();

    if (!trimmedName) {
      throw new ConvexError("TOOL_NAME_REQUIRED");
    }

    return await ctx.db.insert("tools", {
      ownerId: user._id,
      name: trimmedName,
      category: args.category,
      condition: args.condition,
      description: trimmedDescription,
      createdAt: Date.now(),
    });
  },
});

/**
 * Updates an existing tool listing. Restricted strictly to the tool's owner.
 */
export const update = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category: toolCategoryValidator,
    condition: toolConditionValidator,
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);

    if (!tool) {
      throw new ConvexError("TOOL_NOT_FOUND");
    }
    if (tool.ownerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    const trimmedName = args.name.trim();
    if (!trimmedName) {
      throw new ConvexError("TOOL_NAME_REQUIRED");
    }

    await ctx.db.patch(args.toolId, {
      name: trimmedName,
      category: args.category,
      condition: args.condition,
      description: args.description.trim(),
    });

    return args.toolId;
  },
});

/**
 * Deletes a tool listing. Restricted strictly to the tool's owner.
 */
export const remove = mutation({
  args: {
    toolId: v.id("tools"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);

    if (!tool) {
      throw new ConvexError("TOOL_NOT_FOUND");
    }
    if (tool.ownerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    const activeLoans = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", args.toolId))
      .collect();

    const hasActiveApprovedLoan = activeLoans.some(
      (loan) => loan.status === "approved"
    );
    if (hasActiveApprovedLoan) {
      throw new ConvexError("TOOL_HAS_ACTIVE_LOAN");
    }

    await ctx.db.delete(args.toolId);
    return args.toolId;
  },
});

