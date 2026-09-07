import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/providers";
import { AppShell, type ShellConfig } from "@/components/shell/app-shell";
import { HERMES_PROJECT_REF, accessPassword, agentToken, isReadConfigured, isWriteConfigured } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Dustin North Star Project Hermes",
    template: "%s · Hermes",
  },
  description: "Quant PM dashboard for beating QQQ over a decade — portfolio hub, research engine, idea pipeline, quant tools and the North Star mandate.",
  applicationName: "Dustin North Star Project Hermes",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const config: ShellConfig = {
    read: isReadConfigured(),
    write: isWriteConfigured(),
    gate: Boolean(accessPassword()),
    agent: Boolean(agentToken()),
    projectRef: HERMES_PROJECT_REF,
  };
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body>
        <Providers>
          <AppShell config={config}>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
