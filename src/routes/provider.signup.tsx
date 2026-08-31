import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";
import { signUp } from "@/lib/services/auth.service";

interface ProviderSignupData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  category: string;
  experience: string;
  bio: string;
  password: string;
  confirmPassword: string;
  terms: boolean;
}

function ProviderSignupComponent() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data.type === "auth:signup") {
        const data: ProviderSignupData = event.data.payload;

        if (data.password !== data.confirmPassword) {
          setError("Passwords do not match");
          return;
        }

        if (!data.terms) {
          setError("You must agree to the terms");
          return;
        }

        setLoading(true);
        setError(null);

        try {
          const fullName = `${data.firstName} ${data.lastName}`;
          const result = await signUp(
            data.email,
            data.password,
            fullName,
            data.phone,
            "provider"
          );

          if (result.error) {
            setError(result.error);
            setLoading(false);
            return;
          }

          localStorage.setItem(
            "providerSignupDraft",
            JSON.stringify({
              firstName: data.firstName,
              lastName: data.lastName,
              email: data.email,
              phone: data.phone,
              category: data.category,
              experience: data.experience,
              bio: data.bio,
            })
          );

          await router.navigate({ to: "/provider/onboarding" });
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
      <PageFrame src="/pages/provider-signup.html" title="Become a Provider" />
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
      {loading && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
            <p className="mt-4 text-center">Creating your provider account...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/provider/signup")({
  head: () => ({
    meta: [
      { title: "Become a Provider | NINJAWO" },
      { name: "description", content: "Join NINJAWO as a service provider and grow your business." },
    ],
  }),
  component: ProviderSignupComponent,
});
