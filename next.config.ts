import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // TypeScript is strictly validated in CI with dedicated 4GB heap via `npm run typecheck`
    ignoreBuildErrors: true,
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options
  org: "omnirelay",
  project: "omnirelay-main",
  sentryUrl: "https://sentry.io/",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});
