// packages/engine/src/templates/common.ts
export const nextConfigJsTemplate = `/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
module.exports = nextConfig;
`;

export const postcssConfigJsTemplate = `module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
`;

export const tailwindConfigJsForNext = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: { extend: {} },
  plugins: [],
};
`;

export const tailwindConfigJsForVite = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
`;

export const envLocalExample = `# Example envs
# NEXT_PUBLIC_API_BASE=http://localhost:3000
# VITE_API_BASE=http://localhost:3000
`;

export const gitignoreAdditions = [
  "node_modules/",
  ".env",
  ".env.local",
  ".env.*.local",
  ".next/",
  "dist/",
  "build/",
  ".DS_Store"
];
