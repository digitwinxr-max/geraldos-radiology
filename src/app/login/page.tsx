"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { KeyRound, UserRound, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useIntegrationsClientConfig } from "@/hooks/use-integrations";

function LoginInner() {
  const params = useSearchParams();
  const error = params.get("error");
  // Tri-state parity: null while loading, false on fetch failure.
  const configQuery = useIntegrationsClientConfig();
  const keycloakEnabled: boolean | null = configQuery.isError
    ? false
    : configQuery.data
      ? Boolean(configQuery.data.keycloakEnabled)
      : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md">
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

          <Button
            className="w-full gap-2"
            disabled={keycloakEnabled === false}
            onClick={() => (window.location.href = "/api/auth/login")}
          >
            <KeyRound className="h-4 w-4" />
            {keycloakEnabled === false ? "Sign in with Keycloak (unavailable)" : "Sign in with Keycloak"}
          </Button>

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

          <p className="text-center text-xs text-slate-400">
            Keycloak provides enterprise RBAC & SSO. Dev sign-in is available while the
            identity service is being provisioned.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
