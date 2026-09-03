"use client";

import React, { Suspense, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { AlertCircle, KeyRound, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { env } from "@/lib/env";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error") ?? "";
  const signedOut = searchParams.get("signed_out") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Same guard the enforcement points use (src/proxy.ts and
  // src/app/api/auth/dev/route.ts). This is a client component, so NODE_ENV and
  // DEV_AUTH are inlined at BUILD time: without the production half of the
  // check, an image ever built with DEV_AUTH=true would advertise a bypass on
  // the public login screen that the API then refuses with 403.
  const devAuthEnabled = env.devAuthEnabled && !env.isProduction;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => null);
      setFormError(body?.error?.message ?? "Sign-in failed. Check your email and password.");
    } catch {
      setFormError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-white">
          <img src="/gh-logo.png" alt="GH logo" width={56} height={56} className="h-14 w-14 object-contain" />
        </div>
        <CardTitle>MEDICAL DIAGNOSTIC IMAGING</CardTitle>
        <CardDescription>Fluent in Imaging</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{decodeURIComponent(error).replace(/_/g, " ")}</span>
          </div>
        )}
        {signedOut && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            You have been signed out.
          </div>
        )}
        {formError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <FormField label="Email" required>
            <Input
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
          <FormField label="Password" required>
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>
          <Button type="submit" className="w-full gap-2" disabled={submitting}>
            <KeyRound className="h-4 w-4" />
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        {devAuthEnabled && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-400">or</span>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => (window.location.href = "/api/auth/dev")}
            >
              <UserRound className="h-4 w-4" />
              Continue as Administrator (dev)
            </Button>
          </>
        )}

        <p className="text-center text-xs text-slate-400">
          Staff sign in with the email and password recorded in the employee registry.
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
