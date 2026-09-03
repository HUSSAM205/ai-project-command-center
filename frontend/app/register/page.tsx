"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LogoMark } from "@/components/ui/LogoMark";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register({ email, password, full_name: fullName, organization_name: orgName });
      router.push("/app/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create your account. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <LogoMark size={32} />
          <span className="text-sm font-semibold text-text-primary">AI Project Management System</span>
        </Link>
        <div className="rounded-lg border border-border-default bg-surface p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-text-primary">Create your workspace</h1>
          <p className="mt-1 text-sm text-text-tertiary">Set up a new organization in a minute.</p>

          <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
            <Input label="Full name" required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
            <Input label="Organization name" required value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            <Input
              label="Work email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              hint="At least 8 characters."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <p role="alert" className="text-sm text-critical-fg">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" loading={loading}>
              Create account
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-text-tertiary">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
