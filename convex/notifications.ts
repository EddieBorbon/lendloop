import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { createSignedHeaders } from "./lib/hmac";
import { automationEventStatusValidator, automationEventTypeValidator } from "./schema";

export const loanEventTypeValidator = v.union(
  v.literal("loan.requested"),
  v.literal("loan.approved"),
  v.literal("loan.declined"),
  v.literal("loan.returned"),
  v.literal("loan.cancelled")
);

export type LoanEventType =
  | "loan.requested"
  | "loan.approved"
  | "loan.declined"
  | "loan.returned"
  | "loan.cancelled";

/**
 * Retry backoff schedule in milliseconds:
 * attempt 1 fails -> retry in 1 minute
 * attempt 2 fails -> retry in 5 minutes
 * attempt 3 fails -> retry in 15 minutes (or final failure after 3 attempts)
 */
const BACKOFF_DELAYS_MS = [
  1 * 60 * 1000, // 1 minute
  5 * 60 * 1000, // 5 minutes
  15 * 60 * 1000, // 15 minutes
];
const MAX_ATTEMPTS = 3;

/**
 * Internal query that fetches only the minimal fields required for n8n notification.
 * Recipient rule:
 * - `loan.requested` or `loan.cancelled` -> tool owner
 * - `loan.approved`, `loan.declined`, or `loan.returned` -> borrower
 */
export const getLoanNotificationData = internalQuery({
  args: {
    loanId: v.id("loans"),
    eventType: loanEventTypeValidator,
  },
  handler: async (ctx, args) => {
    const loan = await ctx.db.get(args.loanId);
    if (!loan) {
      return null;
    }

    const tool = await ctx.db.get(loan.toolId);
    const recipientUserId =
      args.eventType === "loan.requested" || args.eventType === "loan.cancelled"
        ? loan.ownerId
        : loan.borrowerId;

    const recipient = await ctx.db.get(recipientUserId);
    if (!recipient) {
      return null;
    }

    return {
      loanId: loan._id,
      toolName: tool?.name ?? "Deleted Tool",
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      startDate: loan.startDate,
      endDate: loan.endDate,
    };
  },
});

/**
 * Records or updates an automation event idempotently by `idempotencyKey`.
 */
export const recordAutomationEvent = internalMutation({
  args: {
    idempotencyKey: v.string(),
    loanId: v.id("loans"),
    type: automationEventTypeValidator,
    status: automationEventStatusValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();

    if (existing) {
      if (existing.status !== args.status) {
        await ctx.db.patch(existing._id, {
          status: args.status,
          createdAt: Date.now(),
        });
      }
      return existing._id;
    }

    return await ctx.db.insert("automationEvents", {
      idempotencyKey: args.idempotencyKey,
      loanId: args.loanId,
      type: args.type,
      status: args.status,
      createdAt: Date.now(),
    });
  },
});

/**
 * Sends a signed loan lifecycle event to n8n (`N8N_WEBHOOK_URL`).
 * Enforces strict data minimization: sends ONLY
 * `{ eventId, type, loanId, toolName, recipientEmail, recipientName, startDate, endDate }`.
 * Retries with exponential backoff (1m, 5m, 15m; max 3 attempts) and logs failures
 * in `automationEvents`.
 */
export const sendLoanEvent = internalAction({
  args: {
    loanId: v.id("loans"),
    eventType: loanEventTypeValidator,
    eventId: v.optional(v.string()),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const attempt = args.attempt ?? 1;
    const eventId =
      args.eventId ??
      `evt:${args.loanId}:${args.eventType}:${Date.now()}`;

    const details = await ctx.runQuery(
      internal.notifications.getLoanNotificationData,
      {
        loanId: args.loanId,
        eventType: args.eventType,
      }
    );

    if (!details) {
      return { delivered: false, reason: "LOAN_OR_RECIPIENT_NOT_FOUND" };
    }

    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    const outboundSecret = process.env.N8N_OUTBOUND_SECRET;

    // Minimal payload as specified in Phase 6
    const payload = {
      eventId,
      type: args.eventType,
      loanId: details.loanId,
      toolName: details.toolName,
      recipientEmail: details.recipientEmail,
      recipientName: details.recipientName,
      startDate: details.startDate,
      endDate: details.endDate,
    };

    const rawBody = JSON.stringify(payload);

    let delivered = false;
    if (webhookUrl && outboundSecret) {
      try {
        const signedHeaders = await createSignedHeaders(
          outboundSecret,
          rawBody
        );
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...signedHeaders,
          },
          body: rawBody,
        });

        delivered = response.ok;
      } catch {
        delivered = false;
      }
    }

    if (delivered) {
      await ctx.runMutation(internal.notifications.recordAutomationEvent, {
        idempotencyKey: eventId,
        loanId: args.loanId,
        type: "request_notification",
        status: "sent",
      });
      return { delivered: true, attempt, eventId };
    }

    // Record failure in automationEvents so no failure is ever silent
    await ctx.runMutation(internal.notifications.recordAutomationEvent, {
      idempotencyKey: eventId,
      loanId: args.loanId,
      type: "request_notification",
      status: "failed",
    });

    if (attempt < MAX_ATTEMPTS && webhookUrl && outboundSecret) {
      const delayMs =
        BACKOFF_DELAYS_MS[attempt - 1] ??
        BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1];
      await ctx.scheduler.runAfter(
        delayMs,
        internal.notifications.sendLoanEvent,
        {
          loanId: args.loanId,
          eventType: args.eventType,
          eventId,
          attempt: attempt + 1,
        }
      );
    }

    return { delivered: false, attempt, eventId };
  },
});

