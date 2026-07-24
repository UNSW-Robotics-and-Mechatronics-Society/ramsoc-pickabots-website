import type { MetadataRoute } from "next";

const ORIGIN = "https://pickabots.ramsocunsw.org";

// Every route except `/` is auth-gated and returns 404 to signed-out crawlers,
// so there is nothing else to expose. We deliberately do NOT disallow anything:
// crawlers must be free to fetch `/join` (to see its 308 → `/`) and `/` itself.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${ORIGIN}/sitemap.xml`,
    host: ORIGIN,
  };
}
