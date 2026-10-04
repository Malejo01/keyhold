import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the dev-tools "N" badge (it overlapped the chat input at 375 px). Dev only.
  devIndicators: false,
};

export default nextConfig;
