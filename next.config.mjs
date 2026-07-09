/** @type {import('next').NextConfig} */
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  webpack: (config) => {
    config.resolve.alias["@"] = path.join(__dirname, "src");
    return config;
  },
};

export default nextConfig;
