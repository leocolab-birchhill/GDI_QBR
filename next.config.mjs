/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // pptxgenjs and prisma should run only on the server (not bundled)
    serverComponentsExternalPackages: ["pptxgenjs", "@prisma/client"],
    // Run src/instrumentation.ts on server boot (starts the inbox poller).
    instrumentationHook: true,
  },
};

export default nextConfig;
