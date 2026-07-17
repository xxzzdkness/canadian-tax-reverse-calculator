import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const pagesBasePath = isGitHubPages && repositoryName ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  ...(isGitHubPages ? { output: "export" as const } : {}),
  basePath: pagesBasePath,
  assetPrefix: pagesBasePath || undefined,
  trailingSlash: isGitHubPages,
  images: { unoptimized: true },
  ...(isGitHubPages ? { typescript: { tsconfigPath: "tsconfig.pages.json" } } : {}),
};

export default nextConfig;
