import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // `/join` was the public landing page of an earlier deployment and is
      // still the URL Google has indexed. It no longer exists, so send it
      // permanently (308) to the current landing at `/` — this both keeps the
      // old link working and tells search engines to consolidate it into `/`.
      // Config redirects are evaluated before the Clerk proxy, so this fires
      // even for signed-out crawlers (which the proxy would otherwise 404).
      {
        source: "/join",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
