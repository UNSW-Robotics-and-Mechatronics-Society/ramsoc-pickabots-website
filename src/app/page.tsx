import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

const TITLE = "Pickabots — RAMSoc UNSW Sumobots";
const DESCRIPTION =
  "Back your champion and climb the leaderboard as RAMSoc UNSW's Sumobots battle it out in real time.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "Pickabots",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

// The home page doubles as the app's public face. Signed-in users go straight
// to the live experience; signed-out visitors — and crawlers, which are always
// signed out — get a real, indexable landing page instead of the auth-gated
// 404 that every other route returns. This is the page Google indexes.
export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/voting");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100dvh",
        padding: "24px 20px",
        gap: 28,
        textAlign: "center",
      }}
    >
      <div>
        <h1
          style={{
            fontFamily: "var(--font-audiowide)",
            fontSize: "2.4rem",
            lineHeight: 1.05,
            color: "#FF6B00",
            letterSpacing: 6,
            textTransform: "uppercase",
            textShadow: "0 0 32px rgba(255,107,0,0.45)",
            margin: 0,
          }}
        >
          Pickabots
        </h1>
        <p
          style={{
            marginTop: 10,
            fontSize: "0.62rem",
            fontWeight: 900,
            letterSpacing: 6,
            color: "rgba(255,255,255,0.75)",
            textTransform: "uppercase",
          }}
        >
          RAMSoc UNSW · Sumobots
        </p>
      </div>

      <p
        style={{
          maxWidth: 320,
          fontSize: "0.95rem",
          lineHeight: 1.5,
          color: "rgba(255,255,255,0.82)",
        }}
      >
        {DESCRIPTION}
      </p>

      <Link
        href="/voting"
        style={{
          fontFamily: "var(--font-audiowide)",
          fontSize: "0.8rem",
          letterSpacing: 3,
          textTransform: "uppercase",
          color: "#06080b",
          background: "#FF6B00",
          padding: "12px 28px",
          borderRadius: 10,
          textDecoration: "none",
          boxShadow: "0 0 32px rgba(255,107,0,0.45)",
        }}
      >
        Enter the arena
      </Link>
    </div>
  );
}
