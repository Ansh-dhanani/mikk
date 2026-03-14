import { createMDX } from 'fumadocs-mdx/next';

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  serverExternalPackages: ['fumadocs-mdx'],
};

const withMDX = createMDX();

export default withMDX(config);
