/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Same-origin API when served publicly through the platform tunnel:
    // the browser calls <tunnel-origin>/api/* and Next forwards to the
    // backend over the compose network. Only active when explicitly set
    // (compose sets BACKEND_INTERNAL_URL=http://backend:4000); local
    // `npm run dev` keeps calling localhost:4000 directly.
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_INTERNAL_URL || "http://localhost:4000"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
