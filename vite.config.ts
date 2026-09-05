// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        // TanStack Start is an SSR app (no index.html), so the plugin's
        // auto-injection into HTML never happens. Registration is done
        // manually in src/lib/pwa.ts instead.
        injectRegister: null,
        // The deployed static assets live in the nitro output dir, not dist/.
        outDir: ".output/public",

        includeAssets: ["favicon.png"],

        manifest: {
          id: "/",
          name: "NINJAWO",
          short_name: "NINJAWO",
          description: "Find trusted service providers near you.",
          theme_color: "#0D0D0D",
          background_color: "#FFFFFF",
          display: "standalone",
          start_url: "/",
          scope: "/",
          icons: [
            {
              src: "/icons/pwa-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/icons/pwa-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/icons/pwa-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
          screenshots: [
            {
              src: "/screenshots/wide.png",
              sizes: "1280x720",
              type: "image/png",
              form_factor: "wide",
              label: "NINJAWO — Your Task. Our Ninja. Best Result.",
            },
            {
              src: "/screenshots/narrow.png",
              sizes: "720x1280",
              type: "image/png",
              form_factor: "narrow",
              label: "NINJAWO — Your Task. Our Ninja. Best Result.",
            },
          ],
        },
        workbox: {
          // SSR app: there is no precached index.html app shell, so a
          // navigateFallback would reference a missing file and break
          // navigations. Navigations must always reach the SSR server
          // (which also keeps Supabase auth callback routes intact).
          navigateFallback: undefined,
          // Extra safety: never handle auth/callback navigations.
          navigateFallbackDenylist: [/^\/auth\//],
        },
      }),
    ],
  },

  tanstackStart: {
    server: { entry: "server" },
  },
});
