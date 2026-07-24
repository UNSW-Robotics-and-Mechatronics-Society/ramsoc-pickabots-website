import type { MetadataRoute } from "next";

const ORIGIN = "https://pickabots.ramsocunsw.org";

// Only the public landing is listed — every other route is auth-gated and not
// indexable. `lastModified` is a fixed date (not `new Date()`) so the generated
// sitemap stays byte-stable across builds instead of churning on every deploy.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: ORIGIN,
      lastModified: new Date("2026-07-24"),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
