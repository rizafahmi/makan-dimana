// @ts-check
import { defineConfig } from "astro/config";
import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone", bodySizeLimit: 16384 }),
  security: {
    allowedDomains: [{ hostname: "**.ts.net", protocol: "https" }],
  },
});
