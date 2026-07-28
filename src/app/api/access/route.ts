import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, ACCESS_COOKIE_OPTIONS, accessToken, codeMatches } from "@/lib/access";

// POST { code } — the event access gate. The code is checked here, on the
// server, so it never reaches the browser; on success the response sets the
// httpOnly access cookie the proxy requires for every gated route.
//
// This route is itself exempt from the gate (see proxy.ts) — it's how you get
// through it.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  if (!codeMatches(body?.code)) {
    return NextResponse.json({ error: "Invalid code" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: ACCESS_COOKIE, value: await accessToken(), ...ACCESS_COOKIE_OPTIONS });
  return res;
}
