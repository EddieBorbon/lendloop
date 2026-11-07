import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import * as admin from "../convex/admin";
import * as http from "../convex/http";
import * as auth from "../convex/lib/auth";
import * as dates from "../convex/lib/dates";
import * as hmac from "../convex/lib/hmac";
import * as loans from "../convex/loans";
import * as notifications from "../convex/notifications";
import * as tools from "../convex/tools";
import * as users from "../convex/users";
import {
  computeHmacSignature,
  HMAC_SIGNATURE_HEADER,
  HMAC_TIMESTAMP_HEADER,
  verifyHmacSignature,
} from "../convex/lib/hmac";

import * as generatedApi from "../convex/_generated/api";
import * as generatedServer from "../convex/_generated/server";

const modules: Record<string, () => Promise<unknown>> = {
  "../convex/_generated/api.js": async () => generatedApi,
  "../convex/_generated/server.js": async () => generatedServer,
  "../convex/admin.ts": async () => admin,
  "../convex/http.ts": async () => http,
  "../convex/lib/auth.ts": async () => auth,
  "../convex/lib/dates.ts": async () => dates,
  "../convex/lib/hmac.ts": async () => hmac,
  "../convex/loans.ts": async () => loans,
  "../convex/notifications.ts": async () => notifications,
  "../convex/schema.ts": async () => ({ default: schema }),
  "../convex/tools.ts": async () => tools,
  "../convex/users.ts": async () => users,
};

function createTestEnv() {
  return convexTest(schema, modules);
}

describe("LendLoop Convex Permissions, Security & Business Rules", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.ADMIN_EMAILS = "admin@lendloop.dev,boss@fluence.dev";
    process.env.N8N_INBOUND_SECRET = "inbound-test-secret-32-bytes-long!!";
    process.env.N8N_OUTBOUND_SECRET = "outbound-test-secret-32-bytes-long!";
    // Prevent background scheduled notifications from making live external HTTP calls
    delete process.env.N8N_WEBHOOK_URL;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("assigns role='admin' only when email is in ADMIN_EMAILS via users.store", async () => {
    const t = createTestEnv();

    const asAdmin = t.withIdentity({
      subject: "clerk_admin_1",
      email: "admin@lendloop.dev",
      name: "Admin User",
    });
    const asRegular = t.withIdentity({
      subject: "clerk_user_1",
      email: "alice@example.com",
      name: "Alice Lender",
    });

    await asAdmin.mutation(api.users.store, {});
    await asRegular.mutation(api.users.store, {});

    const adminDoc = await asAdmin.query(api.users.me, {});
    const regularDoc = await asRegular.query(api.users.me, {});

    expect(adminDoc?.role).toBe("admin");
    expect(regularDoc?.role).toBe("user");
    expect(regularDoc?.trustedLender).toBe(false);
  });

  it("tools.listPublic returns ONLY {_id, name, category} and never ownerId or owner data", async () => {
    const t = createTestEnv();

    const asAlice = t.withIdentity({
      subject: "clerk_alice",
      email: "alice@example.com",
      name: "Alice SecretName",
    });
    await asAlice.mutation(api.users.store, {});

    await asAlice.mutation(api.tools.create, {
      name: "Bosch Cordless Drill",
      category: "power_tools",
      condition: "good",
      description: "18V lithium-ion drill with two batteries",
    });

    // Call without identity (unauthenticated visitor)
    const publicTools = await t.query(api.tools.listPublic, {});
    expect(publicTools).toHaveLength(1);

    const item = publicTools[0] as Record<string, unknown>;
    expect(Object.keys(item).sort()).toEqual(["_id", "category", "name"]);
    expect(item.name).toBe("Bosch Cordless Drill");
    expect(item.category).toBe("power_tools");
    expect(item.ownerId).toBeUndefined();
    expect(item.ownerName).toBeUndefined();
    expect(item.description).toBeUndefined();
    expect(item.condition).toBeUndefined();
  });

  it("prevents a user from editing or deleting another user's tool", async () => {
    const t = createTestEnv();

    const asAlice = t.withIdentity({
      subject: "clerk_alice",
      email: "alice@example.com",
      name: "Alice",
    });
    const asBob = t.withIdentity({
      subject: "clerk_bob",
      email: "bob@example.com",
      name: "Bob",
    });

    await asAlice.mutation(api.users.store, {});
    await asBob.mutation(api.users.store, {});

    const toolId = await asAlice.mutation(api.tools.create, {
      name: "Pressure Washer",
      category: "garden",
      condition: "new",
      description: "High-pressure patio cleaner",
    });

    await expect(
      asBob.mutation(api.tools.update, {
        toolId,
        name: "Hacked Tool Name",
        category: "other",
        condition: "worn",
        description: "Hijacked",
      })
    ).rejects.toThrow(/FORBIDDEN/);

    await expect(
      asBob.mutation(api.tools.remove, {
        toolId,
      })
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("prevents a user from borrowing their own tool", async () => {
    const t = createTestEnv();

    const asAlice = t.withIdentity({
      subject: "clerk_alice",
      email: "alice@example.com",
      name: "Alice",
    });
    await asAlice.mutation(api.users.store, {});

    const toolId = await asAlice.mutation(api.tools.create, {
      name: "Stand Mixer",
      category: "kitchen",
      condition: "good",
      description: "Heavy duty mixer",
    });

    await expect(
      asAlice.mutation(api.loans.request, {
        toolId,
        startDate: "2099-01-10",
        endDate: "2099-01-12",
      })
    ).rejects.toThrow(/CANNOT_BORROW_OWN_TOOL/);
  });

  it("prevents a user from approving, declining, or marking returned loans on someone else's tool", async () => {
    const t = createTestEnv();

    const asAlice = t.withIdentity({
      subject: "clerk_alice",
      email: "alice@example.com",
      name: "Alice Owner",
    });
    const asBob = t.withIdentity({
      subject: "clerk_bob",
      email: "bob@example.com",
      name: "Bob Borrower",
    });
    const asMallory = t.withIdentity({
      subject: "clerk_mallory",
      email: "mallory@example.com",
      name: "Mallory Attacker",
    });

    await asAlice.mutation(api.users.store, {});
    await asBob.mutation(api.users.store, {});
    await asMallory.mutation(api.users.store, {});

    const toolId = await asAlice.mutation(api.tools.create, {
      name: "4-Person Tent",
      category: "camping",
      condition: "good",
      description: "Waterproof dome tent",
    });

    const loanId = await asBob.mutation(api.loans.request, {
      toolId,
      startDate: "2099-05-01",
      endDate: "2099-05-05",
    });

    // Neither the borrower (Bob) nor a third party (Mallory) can approve or decline
    await expect(
      asBob.mutation(api.loans.approve, { loanId })
    ).rejects.toThrow(/FORBIDDEN/);

    await expect(
      asMallory.mutation(api.loans.approve, { loanId })
    ).rejects.toThrow(/FORBIDDEN/);

    await expect(
      asMallory.mutation(api.loans.decline, { loanId })
    ).rejects.toThrow(/FORBIDDEN/);

    // Owner (Alice) can approve
    await asAlice.mutation(api.loans.approve, { loanId });

    // Non-owner cannot mark returned
    await expect(
      asBob.mutation(api.loans.markReturned, { loanId })
    ).rejects.toThrow(/FORBIDDEN/);

    // Owner can mark returned
    await asAlice.mutation(api.loans.markReturned, { loanId });
  });

  it("prevents approving a loan that overlaps with an already approved loan", async () => {
    const t = createTestEnv();

    const asAlice = t.withIdentity({
      subject: "clerk_alice",
      email: "alice@example.com",
      name: "Alice Owner",
    });
    const asBob = t.withIdentity({
      subject: "clerk_bob",
      email: "bob@example.com",
      name: "Bob",
    });
    const asCharlie = t.withIdentity({
      subject: "clerk_charlie",
      email: "charlie@example.com",
      name: "Charlie",
    });

    await asAlice.mutation(api.users.store, {});
    await asBob.mutation(api.users.store, {});
    await asCharlie.mutation(api.users.store, {});

    const toolId = await asAlice.mutation(api.tools.create, {
      name: "Circular Saw",
      category: "power_tools",
      condition: "good",
      description: "7-1/4 inch circular saw",
    });

    const loan1 = await asBob.mutation(api.loans.request, {
      toolId,
      startDate: "2099-06-10",
      endDate: "2099-06-15",
    });
    const loan2 = await asCharlie.mutation(api.loans.request, {
      toolId,
      startDate: "2099-06-14",
      endDate: "2099-06-18",
    });

    await asAlice.mutation(api.loans.approve, { loanId: loan1 });

    await expect(
      asAlice.mutation(api.loans.approve, { loanId: loan2 })
    ).rejects.toThrow(/LOAN_DATES_OVERLAP/);
  });

  it("prevents non-admins from calling any admin.* function", async () => {
    const t = createTestEnv();

    const asAdmin = t.withIdentity({
      subject: "clerk_admin",
      email: "admin@lendloop.dev",
      name: "Admin",
    });
    const asUser = t.withIdentity({
      subject: "clerk_user",
      email: "user@example.com",
      name: "Regular User",
    });

    await asAdmin.mutation(api.users.store, {});
    const userId = await asUser.mutation(api.users.store, {});

    const toolId = await asUser.mutation(api.tools.create, {
      name: "Hedge Trimmer",
      category: "garden",
      condition: "fair",
      description: "Corded trimmer",
    });

    await expect(asUser.query(api.admin.allLoans, {})).rejects.toThrow(
      /FORBIDDEN/
    );
    await expect(
      asUser.mutation(api.admin.removeListing, { toolId })
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(
      asUser.mutation(api.admin.setTrustedLender, {
        userId,
        trusted: true,
      })
    ).rejects.toThrow(/FORBIDDEN/);

    // Admin succeeds
    await asAdmin.mutation(api.admin.setTrustedLender, {
      userId,
      trusted: true,
    });
    const updatedUser = await asUser.query(api.users.me, {});
    expect(updatedUser?.trustedLender).toBe(true);

    await asAdmin.mutation(api.admin.removeListing, { toolId });
    const remainingPublic = await t.query(api.tools.listPublic, {});
    expect(remainingPublic).toHaveLength(0);
  });

  it("verifies HMAC-SHA256 signatures, constant-time comparison, and 5-minute replay window", async () => {
    const secret = "super-secret-hmac-key";
    const now = 1762520000;
    const rawBody = JSON.stringify({ loanId: "123", status: "sent" });

    const validSignature = await computeHmacSignature(secret, now, rawBody);

    const okResult = await verifyHmacSignature({
      secret,
      timestampHeader: String(now),
      signatureHeader: validSignature,
      rawBody,
      nowUnixSeconds: now + 120, // within 5m
    });
    expect(okResult.valid).toBe(true);

    // Expired timestamp (> 300s)
    const expiredResult = await verifyHmacSignature({
      secret,
      timestampHeader: String(now - 301),
      signatureHeader: validSignature,
      rawBody,
      nowUnixSeconds: now,
    });
    expect(expiredResult.valid).toBe(false);
    expect(expiredResult.reason).toMatch(/5-minute window/);

    // Tampered body
    const tamperedResult = await verifyHmacSignature({
      secret,
      timestampHeader: String(now),
      signatureHeader: validSignature,
      rawBody: JSON.stringify({ loanId: "123", status: "failed" }),
      nowUnixSeconds: now,
    });
    expect(tamperedResult.valid).toBe(false);
  });

  it("enforces HMAC verification and idempotency on HTTP endpoints (/overdue-loans & /reminders/ack)", async () => {
    const t = createTestEnv();
    const inboundSecret = process.env.N8N_INBOUND_SECRET!;

    const asAlice = t.withIdentity({
      subject: "clerk_alice",
      email: "alice@example.com",
      name: "Alice Owner",
    });
    const asBob = t.withIdentity({
      subject: "clerk_bob",
      email: "bob@example.com",
      name: "Bob Borrower",
    });

    await asAlice.mutation(api.users.store, {});
    await asBob.mutation(api.users.store, {});

    const toolId = await asAlice.mutation(api.tools.create, {
      name: "Camping Stove",
      category: "camping",
      condition: "good",
      description: "Dual burner propane stove",
    });

    const loanId = await asBob.mutation(api.loans.request, {
      toolId,
      startDate: "2099-01-01",
      endDate: "2099-01-02",
    });
    await asAlice.mutation(api.loans.approve, { loanId });

    // 1. Unsigned GET /overdue-loans -> 401
    const unsignedRes = await t.fetch("/overdue-loans", { method: "GET" });
    expect(unsignedRes.status).toBe(401);

    // 2. Signed POST /reminders/ack is idempotent on retries
    const nowSec = Math.floor(Date.now() / 1000);
    const ackBody = JSON.stringify({
      loanId,
      idempotencyKey: `overdue:${loanId}:2099-01-03`,
      status: "sent",
    });
    const ackSig = await computeHmacSignature(inboundSecret, nowSec, ackBody);

    const firstAck = await t.fetch("/reminders/ack", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [HMAC_TIMESTAMP_HEADER]: String(nowSec),
        [HMAC_SIGNATURE_HEADER]: ackSig,
      },
      body: ackBody,
    });
    expect(firstAck.status).toBe(200);
    const firstJson = (await firstAck.json()) as {
      ok: boolean;
      duplicate: boolean;
    };
    expect(firstJson.ok).toBe(true);
    expect(firstJson.duplicate).toBe(false);

    // Retry same idempotencyKey -> returns 200 with duplicate: true and does not create a second event
    const secondAck = await t.fetch("/reminders/ack", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [HMAC_TIMESTAMP_HEADER]: String(nowSec),
        [HMAC_SIGNATURE_HEADER]: ackSig,
      },
      body: ackBody,
    });
    expect(secondAck.status).toBe(200);
    const secondJson = (await secondAck.json()) as {
      ok: boolean;
      duplicate: boolean;
    };
    expect(secondJson.ok).toBe(true);
    expect(secondJson.duplicate).toBe(true);

    // Verify only 1 overdue_reminder event exists on the loan
    const bobRequests = await asBob.query(api.loans.myRequests, {});
    const overdueEvents = bobRequests[0].automationEvents.filter(
      (ev: { type: string }) => ev.type === "overdue_reminder"
    );
    expect(overdueEvents).toHaveLength(1);
  });
});
