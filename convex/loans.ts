import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { requireUser } from "./lib/auth";
import {
  assertValidIsoDate,
  getTodayIsoDate,
  rangesOverlap,
} from "./lib/dates";
import { automationEventStatusValidator } from "./schema";

async function enrichLoanForView(ctx: QueryCtx, loan: Doc<"loans">) {
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
    toolCategory: tool?.category ?? "other",
    ownerName: owner?.name ?? "Unknown Owner",
    borrowerName: borrower?.name ?? "Unknown Borrower",
    automationEvents: events.map((ev) => ({
      _id: ev._id,
      type: ev.type,
      status: ev.status,
      createdAt: ev.createdAt,
      idempotencyKey: ev.idempotencyKey,
    })),
  };
}

/**
 * Requests to borrow a tool for a given date range [startDate, endDate].
 * Business rules enforced:
 * - User cannot borrow their own tool.
 * - `startDate >= today` and `endDate >= startDate` (ISO YYYY-MM-DD).
 * - Cannot overlap with an already `approved` loan on that tool.
 * - Schedules `internal.notifications.sendLoanEvent` (`loan.requested`).
 */
export const request = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);

    if (!tool) {
      throw new ConvexError("TOOL_NOT_FOUND");
    }

    if (tool.ownerId === user._id) {
      throw new ConvexError("CANNOT_BORROW_OWN_TOOL");
    }

    assertValidIsoDate(args.startDate, "startDate");
    assertValidIsoDate(args.endDate, "endDate");

    const todayIso = getTodayIsoDate();
    if (args.startDate < todayIso) {
      throw new ConvexError("START_DATE_IN_PAST");
    }

    if (args.endDate < args.startDate) {
      throw new ConvexError("END_DATE_BEFORE_START_DATE");
    }

    const existingToolLoans = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", args.toolId))
      .collect();

    const overlapsApproved = existingToolLoans.some(
      (loan) =>
        loan.status === "approved" &&
        rangesOverlap(
          args.startDate,
          args.endDate,
          loan.startDate,
          loan.endDate
        )
    );

    if (overlapsApproved) {
      throw new ConvexError("LOAN_DATES_OVERLAP");
    }

    const now = Date.now();
    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      ownerId: tool.ownerId,
      borrowerId: user._id,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "requested",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.notifications.sendLoanEvent, {
      loanId,
      eventType: "loan.requested",
      eventId: `evt:${loanId}:loan.requested:${now}`,
      attempt: 1,
    });

    return loanId;
  },
});

/**
 * Returns loans where the authenticated user is the borrower, including
 * recent automationEvents activity.
 */
export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .order("desc")
      .collect();

    return await Promise.all(loans.map((loan) => enrichLoanForView(ctx, loan)));
  },
});

/**
 * Returns loans requested for tools owned by the authenticated user, including
 * recent automationEvents activity.
 */
export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .collect();

    return await Promise.all(loans.map((loan) => enrichLoanForView(ctx, loan)));
  },
});

/**
 * Approves a pending loan request.
 * Enforces:
 * - Caller must be the owner of the tool.
 * - Loan status must be `"requested"`.
 * - No other `approved` loan for the same tool overlaps with [startDate, endDate].
 */
export const approve = mutation({
  args: {
    loanId: v.id("loans"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);

    if (!loan) {
      throw new ConvexError("LOAN_NOT_FOUND");
    }

    if (loan.ownerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    if (loan.status !== "requested") {
      throw new ConvexError("INVALID_LOAN_STATUS");
    }

    const toolLoans = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", loan.toolId))
      .collect();

    const hasOverlap = toolLoans.some(
      (other) =>
        other._id !== loan._id &&
        other.status === "approved" &&
        rangesOverlap(
          loan.startDate,
          loan.endDate,
          other.startDate,
          other.endDate
        )
    );

    if (hasOverlap) {
      throw new ConvexError("LOAN_DATES_OVERLAP");
    }

    const now = Date.now();
    await ctx.db.patch(loan._id, {
      status: "approved",
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.notifications.sendLoanEvent, {
      loanId: loan._id,
      eventType: "loan.approved",
      eventId: `evt:${loan._id}:loan.approved:${now}`,
      attempt: 1,
    });

    return loan._id;
  },
});

/**
 * Declines a pending loan request.
 * Restricted to the tool owner when `status === "requested"`.
 */
export const decline = mutation({
  args: {
    loanId: v.id("loans"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);

    if (!loan) {
      throw new ConvexError("LOAN_NOT_FOUND");
    }

    if (loan.ownerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    if (loan.status !== "requested") {
      throw new ConvexError("INVALID_LOAN_STATUS");
    }

    const now = Date.now();
    await ctx.db.patch(loan._id, {
      status: "declined",
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.notifications.sendLoanEvent, {
      loanId: loan._id,
      eventType: "loan.declined",
      eventId: `evt:${loan._id}:loan.declined:${now}`,
      attempt: 1,
    });

    return loan._id;
  },
});

/**
 * Marks an approved loan as returned.
 * Restricted to the tool owner when `status === "approved"`.
 */
export const markReturned = mutation({
  args: {
    loanId: v.id("loans"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);

    if (!loan) {
      throw new ConvexError("LOAN_NOT_FOUND");
    }

    if (loan.ownerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    if (loan.status !== "approved") {
      throw new ConvexError("INVALID_LOAN_STATUS");
    }

    const now = Date.now();
    await ctx.db.patch(loan._id, {
      status: "returned",
      updatedAt: now,
      returnedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.notifications.sendLoanEvent, {
      loanId: loan._id,
      eventType: "loan.returned",
      eventId: `evt:${loan._id}:loan.returned:${now}`,
      attempt: 1,
    });

    return loan._id;
  },
});

/**
 * Cancels a pending loan request.
 * Restricted to the borrower when `status === "requested"`.
 */
export const cancel = mutation({
  args: {
    loanId: v.id("loans"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);

    if (!loan) {
      throw new ConvexError("LOAN_NOT_FOUND");
    }

    if (loan.borrowerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    if (loan.status !== "requested") {
      throw new ConvexError("INVALID_LOAN_STATUS");
    }

    const now = Date.now();
    await ctx.db.patch(loan._id, {
      status: "cancelled",
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.notifications.sendLoanEvent, {
      loanId: loan._id,
      eventType: "loan.cancelled",
      eventId: `evt:${loan._id}:loan.cancelled:${now}`,
      attempt: 1,
    });

    return loan._id;
  },
});

/**
 * Internal query used by `GET /overdue-loans` (n8n Flow 2).
 * Returns approved loans where `endDate < today`, minimized strictly to:
 * `{ loanId, toolName, borrowerEmail, borrowerName, endDate }`.
 */
export const listOverdueInternal = internalQuery({
  args: {
    todayIso: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const todayIso = args.todayIso ?? getTodayIsoDate();
    const overdueLoans = await ctx.db
      .query("loans")
      .withIndex("by_status_endDate", (q) =>
        q.eq("status", "approved").lt("endDate", todayIso)
      )
      .collect();

    const results = await Promise.all(
      overdueLoans.map(async (loan) => {
        const [tool, borrower] = await Promise.all([
          ctx.db.get(loan.toolId),
          ctx.db.get(loan.borrowerId),
        ]);

        if (!borrower) {
          return null;
        }

        return {
          loanId: loan._id,
          toolName: tool?.name ?? "Deleted Tool",
          borrowerEmail: borrower.email,
          borrowerName: borrower.name,
          endDate: loan.endDate,
        };
      })
    );

    return results.filter((item): item is NonNullable<typeof item> => item !== null);
  },
});

/**
 * Internal mutation used by `POST /reminders/ack` (n8n Flow 2).
 * Idempotent: if an `automationEvents` entry with `idempotencyKey` already exists,
 * returns `{ duplicate: true }` without creating a duplicate record.
 */
export const acknowledgeReminderInternal = internalMutation({
  args: {
    loanId: v.id("loans"),
    idempotencyKey: v.string(),
    status: automationEventStatusValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();

    if (existing) {
      return {
        duplicate: true,
        eventId: existing._id,
      };
    }

    const loan = await ctx.db.get(args.loanId);
    if (!loan) {
      throw new ConvexError("LOAN_NOT_FOUND");
    }

    const eventId = await ctx.db.insert("automationEvents", {
      idempotencyKey: args.idempotencyKey,
      loanId: args.loanId,
      type: "overdue_reminder",
      status: args.status,
      createdAt: Date.now(),
    });

    return {
      duplicate: false,
      eventId,
    };
  },
});

