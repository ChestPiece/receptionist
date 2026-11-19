import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Route handlers import "@/lib/..."; route tests need the same alias as tsconfig.
export default defineConfig({ resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } } });
