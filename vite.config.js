import {defineConfig} from "vite";

export default defineConfig({
  base: "/duForce/", // Adjust for GitHub Pages
  build: {
    outDir: "docs", // Change from "dist" to "docs"
  }
});
