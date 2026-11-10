import type { NextConfig } from "next";
const config: NextConfig = {
  // The local pilot is an independent source copy beneath an ignored directory.
  turbopack: { root: process.cwd() },
  // Local credentials/databases and verification ledgers are runtime state, never deployable assets.
  outputFileTracingExcludes: {
    "/*": [".env*", ".local/**/*", "artifacts/live/**/*"],
  },
  serverExternalPackages: [
    "pg",
    "@mysten-incubation/memwal",
    "@protobuf-ts/grpc-transport",
    "@grpc/grpc-js",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
