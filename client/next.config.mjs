/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
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
