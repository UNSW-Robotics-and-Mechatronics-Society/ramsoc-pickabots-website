import type { Metadata, Viewport } from "next";
import { Audiowide, Anta } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Suspense } from "react";
import ShaderBackground from "@/components/ShaderBackground";
import BottomNav from "@/components/BottomNav";
import AdminSidePanel from "@/components/AdminSidePanel";
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
            {/* pb leaves room for the fixed glass bottom nav */}
            <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-32 pt-6">
              {children}
            </main>
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
