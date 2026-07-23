"use client";

import { useEffect } from "react";
import { BrandHeader } from "./ui";

// Cookies cannot be set during Server Component render in Next.js (they may
// only be written from a Server Action or Route Handler). For an already-
// onboarded user whose gate cookie is missing/expired we set it client-side
// and hard-navigate to /voting so the proxy re-reads it — otherwise the
// proxy's onboarding gate would bounce them straight back here.
export default function OnboardedRedirect() {
  useEffect(() => {
    document.cookie = `pickabots_onboarded=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
    window.location.replace("/voting");
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6">
      <BrandHeader subtitle="Signing you in" />
      <span
        className="h-6 w-6 animate-spin rounded-full border-2 border-[#FF6B00]/30 border-t-[#FF6B00]"
        aria-hidden
      />
    </div>
  );
}
