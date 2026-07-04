import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/search", label: "Search" },
  { to: "/booking", label: "Booking" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/profile/tech", label: "Profile · Tech" },
  { to: "/profile/design", label: "Profile · Design" },
  { to: "/signup", label: "Sign Up" },
  { to: "/login", label: "Login" },
  { to: "/verify", label: "Verify" },
  { to: "/provider/signup", label: "Become Provider" },
  { to: "/provider/login", label: "Provider Login" },
] as const;

export function PageFrame({ src, title }: { src: string; title: string }) {
  const { pathname } = useLocation();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'navigate') {
        const route = event.data.route;
        // Navigate using the router
        router.navigate({ to: route });
        setOpen(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [router]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#f9f9ff]">
      <iframe
        key={src}
        src={src}
        title={title}
        className="absolute inset-0 h-full w-full border-0"
      />
      {/* Floating screen-switcher */}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
        <div className="pointer-events-auto rounded-full border border-black/10 bg-white/90 shadow-lg backdrop-blur-md">
          {!open ? (
            <button
              onClick={() => setOpen(true)}
              className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-[#003d9b]"
            >
              <span className="h-2 w-2 rounded-full bg-[#003d9b]" />
              ExpertHub · {title}
              <span className="text-xs text-neutral-500">switch screen</span>
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-1 p-1.5">
              {NAV.map((n) => {
                const active = pathname === n.to;
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setOpen(false)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? "bg-[#003d9b] text-white"
                        : "text-neutral-700 hover:bg-neutral-100"
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
              <button
                onClick={() => setOpen(false)}
                className="ml-1 rounded-full px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
