let registered = false;

export function registerServiceWorker() {
  if (registered || typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  registered = true;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // autoUpdate: check for a new SW on every page load
        registration.update().catch(() => {
          /* offline — ignore */
        });
      })
      .catch((error) => {
        console.warn("[PWA] Service worker registration failed:", error);
      });
  });
}
