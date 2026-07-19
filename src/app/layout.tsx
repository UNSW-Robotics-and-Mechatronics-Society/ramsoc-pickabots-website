import type { Metadata, Viewport } from "next";
import { Audiowide, Anta } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Suspense } from "react";
import ShaderBackground from "@/components/ShaderBackground";
import BottomNav from "@/components/BottomNav";
import AdminSidePanel from "@/components/AdminSidePanel";
import MainShell from "@/components/MainShell";
import { AdminPanelProvider } from "@/components/admin/AdminPanelContext";
import "./globals.css";

const audiowide = Audiowide({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-audiowide",
});

const anta = Anta({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anta",
});

export const metadata: Metadata = {
  title: "RAMSoc Pickabots",
  description:
    "Pickabots — the RAMSoc UNSW robotics competition. Build, compete, and win.",
  icons: {
    icon: [{ url: "/ramsoc_logo.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#06080b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${audiowide.variable} ${anta.variable}`}>
        <body className="min-h-dvh antialiased" suppressHydrationWarning>
          <AdminPanelProvider>
            <ShaderBackground />
            {/* Centered reading column for most routes; full-width for the
                bracket / matches pages (see MainShell). pb on the centered
                variant leaves room for the fixed glass bottom nav. */}
            <MainShell>{children}</MainShell>
            <BottomNav />
            {/* Suspense required because AdminSidePanel uses useSearchParams() */}
            <Suspense>
              <AdminSidePanel />
            </Suspense>
          </AdminPanelProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
