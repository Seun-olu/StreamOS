import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // PGlite ships a WASM Postgres build that must be loaded from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Read at runtime with fs, so serverless bundles must include them.
  outputFileTracingIncludes: {
    "/**": ["./db/migrations/*.sql", "./db/*.sql", "./node_modules/@electric-sql/pglite/dist/**"],
  },
};

export default nextConfig;
