import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// /dev is a development-only component gallery. It's exempted from every gate
// here so it's reachable without auth/standby, and the page itself 404s in
// production (see app/dev/page.tsx), so exempting it is safe.
const isPublicRoute      = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/dev(.*)"]);
const isPasswordExempt   = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/standby", "/api/(.*)", "/dev(.*)"]);
const isOnboardingExempt = createRouteMatcher([
  "/onboarding(.*)",
  "/dev(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/standby",
  "/api/(.*)",
]);

const ACCESS_COOKIE     = "pickabots_access";
const ONBOARDED_COOKIE  = "pickabots_onboarded";

// /admin is auth-gated here (must be signed in). The admin role check
// (publicMetadata.role === "admin") is enforced in app/admin/page.tsx via
// currentUser() — per Next.js guidance, authorization lives in the Server
// Component, not the proxy, so it's never accidentally bypassed by a new route.
export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  const { userId } = await auth();

  // Event access password first — everyone must pass the standby gate.
  if (!isPasswordExempt(req)) {
    const cookie = req.cookies.get(ACCESS_COOKIE);
    if (cookie?.value !== "1") {
      return NextResponse.redirect(new URL("/standby", req.url));
    }
  }

  // Then the onboarding gate: signed-in users who haven't completed onboarding
  // are funnelled to /onboarding (the cookie is set once onboarding finishes).
  if (userId && !isOnboardingExempt(req)) {
    const cookie = req.cookies.get(ONBOARDED_COOKIE);
    if (cookie?.value !== "1") {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
