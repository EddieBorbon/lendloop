import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isEmailInAdminList, requireUser } from "./lib/auth";

/**
 * Creates or updates the authenticated user in the `users` table upon login.
 * Role assignment is strictly determined server-side via the `ADMIN_EMAILS`
 * environment variable and never accepted from the client.
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("UNAUTHENTICATED");
    }

    const clerkId = identity.subject;
    const email = (identity.email ?? "").trim().toLowerCase();
    const name =
      identity.name ??
      identity.nickname ??
      (email ? email.split("@")[0] : "LendLoop Member");

    const role: "admin" | "user" =
      email && isEmailInAdminList(email) ? "admin" : "user";

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: email || existing.email,
        name: name || existing.name,
        role,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId,
      email,
      name,
      role,
      trustedLender: false,
    });
  },
});

/**
 * Returns the currently authenticated user's profile, or null if not yet stored/logged in.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});

/**
 * Explicitly requires authentication and returns the current user document.
 */
export const currentRequired = query({
  args: {
    _unused: v.optional(v.string()),
  },
  handler: async (ctx) => {
    return await requireUser(ctx);
  },
});

