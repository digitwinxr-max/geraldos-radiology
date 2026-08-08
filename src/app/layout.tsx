import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { AppShellProvider } from "@/components/app-shell-context";
import { CommandPalette } from "@/components/command-palette";
import "./globals.css";

export const metadata: Metadata = {
  title: "MEDICAL DIAGNOSTIC IMAGING — Fluent in Imaging",
  description: "Medical Diagnostic Imaging Operations Platform by Gerald Holdings — Fluent in Imaging",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <Providers>
          <AppShellProvider>
            {children}
            <CommandPalette />
          </AppShellProvider>
        </Providers>
      </body>
    </html>
  );
}
