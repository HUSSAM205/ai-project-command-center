"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Spinner } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";
import { useSlowLoadHint } from "@/lib/useSlowLoadHint";

export default function DemoPage() {
  const { startDemo } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const slow = useSlowLoadHint(!error);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        await startDemo();
        if (!cancelled) router.replace("/app/dashboard");
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not start the demo session. The backend may be offline.",
          );
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm text-center">
        {error ? (
          <ErrorState
            title="Couldn't connect"
            description={error}
            offline={error.includes("offline")}
            onRetry={() => window.location.reload()}
          />
        ) : (
          <>
            <Spinner className="mx-auto h-8 w-8" />
            <p className="mt-4 text-sm text-text-secondary">
              {slow ? "Still connecting — the live backend can take up to a minute to wake up after being idle." : "Loading your workspace…"}
            </p>
          </>
        )}
        {error && (
          <Button variant="ghost" size="sm" className="mt-4" onClick={() => router.push("/")}>
            Back to home
          </Button>
        )}
      </div>
    </div>
  );
}
