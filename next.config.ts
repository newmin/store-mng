import type { NextConfig } from "next";
import { randomUUID } from "node:crypto";

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  env: {
    // Inline the same deployment version into both the client and API bundles.
    NEXT_PUBLIC_APP_VERSION:
      process.env.VERCEL_DEPLOYMENT_ID ||
      process.env.VERCEL_URL ||
      randomUUID(),
  },
};
export default config;
