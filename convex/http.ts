import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import {
  HMAC_SIGNATURE_HEADER,
  HMAC_TIMESTAMP_HEADER,
  verifyHmacSignature,
} from "./lib/hmac";

const http = httpRouter();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * GET /overdue-loans
 * Verifies inbound HMAC-SHA256 signature from n8n (`N8N_INBOUND_SECRET`)
 * and returns approved loans with `endDate < today`, strictly minimized to:
 * `{ loanId, toolName, borrowerEmail, borrowerName, endDate }`.
 */
http.route({
  path: "/overdue-loans",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const inboundSecret = process.env.N8N_INBOUND_SECRET ?? "";
    const timestampHeader = request.headers.get(HMAC_TIMESTAMP_HEADER);
    const signatureHeader = request.headers.get(HMAC_SIGNATURE_HEADER);

    const verification = await verifyHmacSignature({
      secret: inboundSecret,
      timestampHeader,
      signatureHeader,
      rawBody: "",
    });

    if (!verification.valid) {
      return jsonResponse(
        { error: "UNAUTHORIZED", reason: verification.reason },
        401
      );
    }

    const overdueLoans = await ctx.runQuery(
      internal.loans.listOverdueInternal,
      {}
    );

    return jsonResponse({ loans: overdueLoans }, 200);
  }),
});

/**
 * POST /reminders/ack
 * Verifies inbound HMAC-SHA256 signature from n8n (`N8N_INBOUND_SECRET`)
 * and records `{ loanId, idempotencyKey, status }` idempotently.
 * Key convention: `overdue:{loanId}:{YYYY-MM-DD}`.
 */
http.route({
  path: "/reminders/ack",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const inboundSecret = process.env.N8N_INBOUND_SECRET ?? "";
    const timestampHeader = request.headers.get(HMAC_TIMESTAMP_HEADER);
    const signatureHeader = request.headers.get(HMAC_SIGNATURE_HEADER);
    const rawBody = await request.text();

    const verification = await verifyHmacSignature({
      secret: inboundSecret,
      timestampHeader,
      signatureHeader,
      rawBody,
    });

    if (!verification.valid) {
      return jsonResponse(
        { error: "UNAUTHORIZED", reason: verification.reason },
        401
      );
    }

    let parsed: {
      loanId?: string;
      idempotencyKey?: string;
      status?: string;
    };

    try {
      parsed = JSON.parse(rawBody) as {
        loanId?: string;
        idempotencyKey?: string;
        status?: string;
      };
    } catch {
      return jsonResponse({ error: "INVALID_JSON" }, 400);
    }

    const { loanId, idempotencyKey, status } = parsed;
    if (
      !loanId ||
      typeof loanId !== "string" ||
      !idempotencyKey ||
      typeof idempotencyKey !== "string" ||
      (status !== "sent" && status !== "failed")
    ) {
      return jsonResponse({ error: "INVALID_PAYLOAD" }, 400);
    }

    const result = await ctx.runMutation(
      internal.loans.acknowledgeReminderInternal,
      {
        loanId: loanId as Id<"loans">,
        idempotencyKey,
        status,
      }
    );

    return jsonResponse(
      {
        ok: true,
        duplicate: result.duplicate,
        eventId: result.eventId,
      },
      200
    );
  }),
});

export default http;

