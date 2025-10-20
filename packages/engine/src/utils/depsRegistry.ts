export const PINNED_VERSIONS: Record<string, string> = {
  react: "^18.3.1",
  "react-dom": "^18.3.1",
  next: "^14.2.5",
  vite: "^5.2.0",
  express: "^4.19.2",
};

export function suggestVersion(name: string): string {
  if (PINNED_VERSIONS[name]) return PINNED_VERSIONS[name];
  if (name.startsWith("@types/")) return "^1.0.0";
  return "^1.0.0";
}

export function getPinnedDeps(): Record<string, string> {
  return { ...PINNED_VERSIONS };
}

export default suggestVersion;
