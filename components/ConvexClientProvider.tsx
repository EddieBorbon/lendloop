"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { api } from "@/convex/_generated/api";

import { AlertCircle, Terminal } from "lucide-react";

const RAW_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL?.trim() ?? "";
const IS_CONVEX_CONFIGURED =
  RAW_CONVEX_URL.startsWith("http://") || RAW_CONVEX_URL.startsWith("https://");

// Safe localhost URL used only during static build or before `npx convex dev`
// populates `.env.local` so `ConvexReactClient` never throws a fatal domain parse error.
const CONVEX_URL = IS_CONVEX_CONFIGURED
  ? RAW_CONVEX_URL
  : "http://127.0.0.1:3210";

const CLERK_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ||
  "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k";

function UserSync() {
  const { isAuthenticated } = useConvexAuth();
  const storeUser = useMutation(api.users.store);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      syncedRef.current = false;
      return;
    }
    if (syncedRef.current) {
      return;
    }
    syncedRef.current = true;
    void storeUser().catch(() => {
      syncedRef.current = false;
    });
  }, [isAuthenticated, storeUser]);

  return null;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const convex = useMemo(() => new ConvexReactClient(CONVEX_URL), []);

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {!IS_CONVEX_CONFIGURED && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  Convex environment is not connected yet (
                  <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">
                    NEXT_PUBLIC_CONVEX_URL
                  </code>{" "}
                  is empty).
                </span>
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-amber-800">
                <Terminal className="h-3.5 w-3.5" />
                <span>Run `npx convex dev` and configure `.env.local`</span>
              </span>
            </div>
          </div>
        )}
        {IS_CONVEX_CONFIGURED && <UserSync />}
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

