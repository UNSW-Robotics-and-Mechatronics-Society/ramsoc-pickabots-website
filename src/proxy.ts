import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, accessToken } from "@/lib/access";

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
// /overlay/* renders inside OBS Browser Sources on the streaming PC — a
// context that is ALWAYS signed out and holds no cookies, so it must clear
// every gate (auth, event password, onboarding) or the broadcast shows a
// Clerk sign-in page instead of a lower-third. Safe to expose: the overlays
// are literally what gets broadcast on the public livestream.
const PUBLIC_PATHS       = ["/", "/robots.txt", "/sitemap.xml", "/overlay(.*)"];
// POST /api/access is how the event code is submitted, so it can't sit behind
// the gate it opens. It's public and exempt everywhere for that reason — all it
// does is compare a code and, on a match, set the access cookie.
const isPublicRoute      = createRouteMatcher([...PUBLIC_PATHS, "/sign-in(.*)", "/sign-up(.*)", "/dev(.*)", "/api/access"]);
// Everything not listed here needs the event access cookie — including every
// other /api route, which used to be exempt (so a signed-in visitor could read
// live match/leaderboard data without ever entering the code). The overlays are
// unaffected: they're server components that read the DB directly, and their one
// client piece (OverlayRefresh) re-requests the public /overlay route itself,
// never /api. The only OBS-related /api calls come from /control, whose human
// operator passes the gate normally.
const isPasswordExempt   = createRouteMatcher([...PUBLIC_PATHS, "/sign-in(.*)", "/sign-up(.*)", "/standby", "/api/access", "/dev(.*)"]);
const isOnboardingExempt = createRouteMatcher([
  ...PUBLIC_PATHS,
  "/onboarding(.*)",
  "/dev(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/standby",
  "/api/(.*)",
  // Admins are staff, not competitors — they should never be funnelled
  // through competitor onboarding just to reach the admin panel.
  "/admin(.*)",
]);

const ONBOARDED_COOKIE  = "pickabots_onboarded";

// Flip back to true to re-enable the /onboarding redirect gate.
const ONBOARDING_GATE_ENABLED = true;

// /admin is auth-gated here (must be signed in). The admin role check
// (publicMetadata.role === "admin") is enforced in app/admin/page.tsx via
// currentUser() — per Next.js guidance, authorization lives in the Server
// Component, not the proxy, so it's never accidentally bypassed by a new route.
export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  const { userId } = await auth();

  // Event access code first — everyone must pass the standby gate. The cookie
  // must hold the server-derived token (see lib/access): it's set only by
  // POST /api/access after the code checks out, and can't be hand-written.
  if (!isPasswordExempt(req)) {
    const cookie = req.cookies.get(ACCESS_COOKIE);
    if (cookie?.value !== (await accessToken())) {
      // API callers get a status they can act on; a redirect to an HTML page
      // would just surface as a JSON parse error in the client.
      if (req.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Event access code required" }, { status: 403 });
      }
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
