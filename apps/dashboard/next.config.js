/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    ALPHASCOUT_URL: process.env.ALPHASCOUT_URL || "http://localhost:8000",
  },
};

module.exports = nextConfig;
