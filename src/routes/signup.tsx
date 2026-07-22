import { useState, useEffect } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";
import { signUp } from "@/lib/services/auth.service";

interface SignupData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  password: string;
  confirmPassword: string;
  newsletter: boolean;
  terms: boolean;
}

function SignupComponent() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data.type === "auth:signup") {
        const data: SignupData = event.data.payload;

        // Validation
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
            "customer"
          );

          if (!result) {
            setError("Sign up failed. Please try again.");
            setLoading(false);
            return;
          }

          // Navigate directly to dashboard — verification skipped
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
      <PageFrame src="/pages/signup.html" title="Sign Up" />
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
      {loading && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
            <p className="mt-4 text-center">Creating your account...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign Up | ExpertHub" },
      {
        name: "description",
        content:
          "Create your ExpertHub account to find and book vetted professionals.",
      },
    ],
  }),
  component: SignupComponent,
});
