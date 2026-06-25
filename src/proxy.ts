import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute    = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);
const isPasswordExempt = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/standby", "/api/(.*)"]);

const ACCESS_COOKIE = "pickabots_access";

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  if (!isPasswordExempt(req)) {
    const cookie = req.cookies.get(ACCESS_COOKIE);
    if (cookie?.value !== "1") {
      return NextResponse.redirect(new URL("/standby", req.url));
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
