"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push("/app/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-700 text-sm font-bold text-white">AC</span>
          <span className="text-sm font-semibold text-text-primary">AI Project Command Center</span>
        </Link>
        <div className="rounded-lg border border-border-default bg-surface p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-text-primary">Sign in</h1>
          <p className="mt-1 text-sm text-text-tertiary">Access your organization&apos;s workspace.</p>

          <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <p role="alert" className="text-sm text-critical-fg">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" loading={loading}>
              Sign in
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-text-tertiary">
            No account?{" "}
            <Link href="/register" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
              Create one
            </Link>
          </p>
        </div>
        <p className="mt-4 text-center text-sm text-text-tertiary">
          Just exploring?{" "}
          <Link href="/demo" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
            Try the live demo
          </Link>
        </p>
      </div>
    </div>
  );
}
