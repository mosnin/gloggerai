/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { typedRoutes: false },
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Authorization,Content-Type,Idempotency-Key" },
        ],
      },
    ];
  },
};
export default nextConfig;
