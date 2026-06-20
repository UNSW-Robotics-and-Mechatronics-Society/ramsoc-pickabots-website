// Next.js 16 renamed the `middleware` file convention to `proxy`.
// Clerk's helper is unchanged — it just needs to be the file's default export.
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Everything is private except the auth routes. Any unauthenticated request to
// a non-public route is redirected straight to sign-in by auth.protect().
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

// /admin is auth-gated here (must be signed in). The admin role check
// (publicMetadata.role === "admin") is enforced in app/admin/page.tsx via
// currentUser() — per Next.js guidance, authorization lives in the Server
// Component, not the proxy, so it's never accidentally bypassed by a new route.
export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
