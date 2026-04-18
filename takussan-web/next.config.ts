import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'http', hostname: '127.0.0.1', port: '8002' },
      { protocol: 'http', hostname: 'localhost', port: '8002' },
    ],
  },
};

export default nextConfig;
