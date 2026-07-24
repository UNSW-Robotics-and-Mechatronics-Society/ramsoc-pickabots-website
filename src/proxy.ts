import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// /dev is a development-only component gallery. It's exempted from every gate
// here so it's reachable without auth/standby, and the page itself 404s in
// production (see app/dev/page.tsx), so exempting it is safe.
//
// The public surface: `/` is the marketing landing (app/page.tsx renders it for
// signed-out visitors and redirects signed-in users into the app), and
// `/robots.txt` + `/sitemap.xml` are the crawler files. All three must return
// 200 to signed-out crawlers — Googlebot is always signed out — so search
// engines can index the site instead of caching a stale 404. They are exempt
// from every gate below; none of them expose gated app content.
const PUBLIC_PATHS       = ["/", "/robots.txt", "/sitemap.xml"];
const isPublicRoute      = createRouteMatcher([...PUBLIC_PATHS, "/sign-in(.*)", "/sign-up(.*)", "/dev(.*)"]);
const isPasswordExempt   = createRouteMatcher([...PUBLIC_PATHS, "/sign-in(.*)", "/sign-up(.*)", "/standby", "/api/(.*)", "/dev(.*)"]);
const isOnboardingExempt = createRouteMatcher([
  ...PUBLIC_PATHS,
  "/onboarding(.*)",
  "/dev(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/standby",
  "/api/(.*)",
]);

const ACCESS_COOKIE     = "pickabots_access";
const ONBOARDED_COOKIE  = "pickabots_onboarded";

// Temporarily disabled so people can sign up with Clerk and bid immediately.
// Flip back to true to re-enable the /onboarding redirect gate.
const ONBOARDING_GATE_ENABLED = false;

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
  if (ONBOARDING_GATE_ENABLED && userId && !isOnboardingExempt(req)) {
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
