/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Smaller production bundle for Databricks Apps deploys.
  output: "standalone",
  experimental: {
    // pptxgenjs and prisma should run only on the server (not bundled)
    serverComponentsExternalPackages: [
      "pptxgenjs",
      "@prisma/client",
      "@databricks/lakebase",
      "@databricks/sdk-experimental",
      "pg",
    ],
    // Run src/instrumentation.ts on server boot (starts the inbox poller).
    instrumentationHook: true,
  },
};

export default nextConfig;
