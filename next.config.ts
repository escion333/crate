import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // All routes are static: no image optimizer, server actions, or Node runtime.
  output: 'export',
}

export default nextConfig
