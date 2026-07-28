// Event access gate — the "enter the code to get in" door in front of the whole
// app (see proxy.ts and app/standby).
//
// SERVER ONLY, and deliberately not marked with `import "server-only"`: this is
// imported by proxy.ts, which is bundled outside the React server graph. Never
// import it from a Client Component — the code itself must never be shipped to
// the browser, which is exactly the hole this replaced (the previous version
// compared the code inside the standby page's client bundle, so anyone could
// read it in devtools — and the cookie it set was a plain "1" that could just
// be typed in by hand).
//
// Instead: the code is checked on the server (POST /api/access) and, on success,
// the browser gets an httpOnly cookie holding an opaque token derived from the
// code plus a server secret. The proxy accepts nothing else, so the cookie
// can't be forged without knowing the code.

/** Name of the cookie the proxy checks before letting anyone into the app. */
export const ACCESS_COOKIE = "pickabots_access";

/** Used when EVENT_ACCESS_CODE isn't set, so the event still has a working gate. */
const DEFAULT_CODE = "SUMO26";

/** Codes are compared case- and punctuation-insensitively, like the input box. */
function normalise(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function configuredCode(): string {
  return normalise(process.env.EVENT_ACCESS_CODE ?? DEFAULT_CODE);
}

/** True when the submitted code is the event's code. */
export function codeMatches(input: unknown): boolean {
  if (typeof input !== "string") return false;
  const given = normalise(input);
  return given.length > 0 && given === configuredCode();
}

// Derived once per process. It's a pure function of the environment, so the
// proxy and the route handler independently arrive at the same value — no
// shared state between them (which the proxy docs warn against relying on).
let cachedToken: Promise<string> | null = null;

/**
 * The only cookie value the gate accepts: SHA-256 of the event code peppered
 * with a server-side secret. Unguessable without the secret, and stable across
 * requests so it can be compared directly.
 */
export function accessToken(): Promise<string> {
  cachedToken ??= deriveToken();
  return cachedToken;
}

async function deriveToken(): Promise<string> {
  // CLERK_SECRET_KEY is always present (the app can't boot without it), so
  // there's a real pepper even if EVENT_ACCESS_SECRET isn't set. Hashing means
  // neither secret is recoverable from the cookie.
  const pepper = process.env.EVENT_ACCESS_SECRET ?? process.env.CLERK_SECRET_KEY ?? "";
  const bytes = new TextEncoder().encode(`pickabots-access|${configuredCode()}|${pepper}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

/** Cookie options for the granted-access cookie. Kept next to the token itself. */
export const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
  secure: process.env.NODE_ENV === "production",
} as const;
