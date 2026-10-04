import path from "path";
import type { NextConfig } from "next";

// Pin the Turbopack workspace root. Without this Next walks up and picks
// C:\Users\CPXru\package-lock.json as the root, which breaks module resolution
// for the whole app.
const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;