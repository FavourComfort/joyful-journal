import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";
import { signIn } from "@/lib/services/auth.service";
import { getProviderByUserId } from "@/lib/services/providers.service";

interface LoginData {
  email: string;
  password: string;
  remember: boolean;
}

function ProviderLoginComponent() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data.type === "auth:login") {
        const data: LoginData = event.data.payload;

        setLoading(true);
        setError(null);

        try {
          const result = await signIn(data.email, data.password);

          if (!result || result.error) {
            setError(
              result?.error || "Sign in failed. Please check your credentials."
            );
            setLoading(false);
            return;
          }

          if (data.remember) {
            localStorage.setItem("rememberEmail", data.email);
          }

          if (result.data?.role === "provider") {
            const provider = await getProviderByUserId(result.data.id);
            if (!provider) {
              await router.navigate({ to: "/provider/onboarding" });
              return;
            }
            await router.navigate({ to: "/provider/dashboard" });
            return;
          }

          await router.navigate({ to: "/dashboard" });
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "An error occurred";
          setError(errorMessage);
          setLoading(false);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [router]);

  return (
    <div>
      <PageFrame src="/pages/provider-login.html" title="Provider Login" />
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
      {loading && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
            <p className="mt-4 text-center">Signing in...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/provider/login")({
  head: () => ({
    meta: [
      { title: "Provider Login | NINJAWO" },
      { name: "description", content: "Sign in to your NINJA account." },
    ],
  }),
  component: ProviderLoginComponent,
});
