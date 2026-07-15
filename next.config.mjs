/** @type {import('next').NextConfig} */

// GitHub Pages project sites are served under a sub-path (/<repo>). Set BASE_PATH
// in the environment (the deploy workflow does) to prefix routes and assets.
// Leave it empty for a custom domain / user page served from the root.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig = {
  reactStrictMode: true,
  // Fully static HTML export — no server, deployable to any static host.
  output: "export",
  basePath: basePath || undefined,
  images: { unoptimized: true },
  // Emit /route/index.html so paths work without a rewriting server.
  trailingSlash: true,
};

export default nextConfig;
