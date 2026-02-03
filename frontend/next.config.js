/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow images from the worker domain if needed
  images: {
    remotePatterns: [],
  },
  // Output standalone for containerized deployments
  output: 'standalone',
};

module.exports = nextConfig;
