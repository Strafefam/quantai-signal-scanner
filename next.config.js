/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
  },
  images: {
    domains: ['example.com'], // Replace with your allowed domains for image optimization
  },
};

module.exports = nextConfig;