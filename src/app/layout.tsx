import type { Metadata, Viewport } from "next";
import { Audiowide, Anta } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import ShaderBackground from "@/components/ShaderBackground";
import BottomNav from "@/components/BottomNav";
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
        <body className="min-h-dvh antialiased">
          <ShaderBackground />
          {/* pb leaves room for the fixed glass bottom nav */}
          <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col">
            {children}
          </main>
          <BottomNav />
        </body>
      </html>
    </ClerkProvider>
  );
}
