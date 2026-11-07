import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type AuthCtx = QueryCtx | MutationCtx;

/**
 * Requires an authenticated user present in the `users` table.
 * Throws ConvexError("UNAUTHENTICATED") if no identity or user record exists.
 */
export async function requireUser(ctx: AuthCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("UNAUTHENTICATED");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user) {
    throw new ConvexError("UNAUTHENTICATED");
  }

  return user;
}

/**
 * Requires an authenticated user with `role === "admin"`.
 * Throws ConvexError("UNAUTHENTICATED") if not signed in or ConvexError("FORBIDDEN") if not admin.
 */
export async function requireAdmin(ctx: AuthCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new ConvexError("FORBIDDEN");
  }
  return user;
}

/**
 * Parses the ADMIN_EMAILS environment variable (comma-separated list)
 * and checks whether the given email belongs to an administrator.
 */
export function isEmailInAdminList(email: string): boolean {
  const raw = process.env.ADMIN_EMAILS ?? "";
  const adminEmails = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return adminEmails.includes(email.trim().toLowerCase());
}

