"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

/**
 * Root route: no marketing interstitial before the product. `AuthProvider` (lib/auth.tsx)
 * already auto-establishes a live session on first mount for any visitor with none — this
 * component's only job is to wait for that and move straight into the command center.
 *
 * The full platform overview (previously the root landing page) still exists in full at
 * /platform for anyone who wants it — nothing was deleted, it's just no longer a forced stop
 * before the product itself.
 */
export default function RootEntry() {
  const { isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/app/dashboard");
    }
  }, [isLoading, isAuthenticated, router]);

  if (!isLoading && !isAuthenticated) {
    // Real failure (backend unreachable) — an honest retry state, not an infinite spinner.
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <ErrorState
          title="Couldn't connect"
          description="The backend may be offline. Try again in a moment."
          offline
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
