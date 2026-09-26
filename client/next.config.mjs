/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei", "framer-motion"],
  webpack: (config) => {
    // Handle Three.js / R3F modules
    config.externals = config.externals || [];
    return config;
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
