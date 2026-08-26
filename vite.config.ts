import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const isGitHubActions = process.env.GITHUB_ACTIONS === "true";
  return {
    base: isGitHubActions ? "/reservas/" : "/",
    plugins: [react()],
    server: { port: 5174 },
    build: { outDir: "docs" },
  };
});
