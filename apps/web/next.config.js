/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@repo/ui', '@repo/auth', '@repo/database'],
  images: {
    domains: ['lh3.googleusercontent.com'],
  },
};

module.exports = nextConfig;
