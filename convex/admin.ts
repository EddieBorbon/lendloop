import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

/**
 * Admin-only: removes any tool listing regardless of owner.
 */
export const removeListing = mutation({
  args: {
    toolId: v.id("tools"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const tool = await ctx.db.get(args.toolId);
    if (!tool) {
      throw new ConvexError("TOOL_NOT_FOUND");
    }

    await ctx.db.delete(args.toolId);
    return args.toolId;
  },
});

/**
 * Admin-only: returns all loans across the platform with tool, owner, borrower,
 * and automationEvents history.
 */
export const allLoans = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const loans = await ctx.db.query("loans").order("desc").collect();

    return await Promise.all(
      loans.map(async (loan) => {
        const [tool, owner, borrower, events] = await Promise.all([
          ctx.db.get(loan.toolId),
          ctx.db.get(loan.ownerId),
          ctx.db.get(loan.borrowerId),
          ctx.db
            .query("automationEvents")
            .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
            .order("desc")
            .collect(),
        ]);

        return {
          ...loan,
          toolName: tool?.name ?? "Deleted Tool",
          ownerName: owner?.name ?? "Unknown Owner",
          ownerEmail: owner?.email ?? "",
          borrowerName: borrower?.name ?? "Unknown Borrower",
          borrowerEmail: borrower?.email ?? "",
          automationEvents: events.map((ev) => ({
            _id: ev._id,
            type: ev.type,
            status: ev.status,
            createdAt: ev.createdAt,
            idempotencyKey: ev.idempotencyKey,
          })),
        };
      })
    );
  },
});

/**
 * Admin-only: sets or unsets the Trusted Lender badge on a user.
 */
export const setTrustedLender = mutation({
  args: {
    userId: v.id("users"),
    trusted: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) {
      throw new ConvexError("USER_NOT_FOUND");
    }

    await ctx.db.patch(args.userId, {
      trustedLender: args.trusted,
    });

    return args.userId;
  },
});

/**
 * Admin-only: lists all users to manage Trusted Lender status in `/admin`.
 */
export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("users").order("desc").collect();
  },
});

