/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Native / heavy server-only modules must not be bundled by webpack; they are
  // required at runtime from node_modules instead.
  experimental: {
    serverComponentsExternalPackages: ["bcrypt", "postgres", "xlsx"],
  },
};

export default nextConfig;
