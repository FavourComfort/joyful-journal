import { useState, useEffect } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";

interface VerifyData {
  code: string;
}

function VerifyComponent() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    // Get email from session storage
    const storedEmail = sessionStorage.getItem("signupEmail");
    setEmail(storedEmail || "");
  }, []);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data.type === "auth:verify") {
        const data: VerifyData = event.data.payload;

        setLoading(true);
        setError(null);

        try {
          // In a real app, you would verify the code with your backend
          // For now, we'll simulate verification by waiting a moment
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Clear session storage
          sessionStorage.removeItem("signupEmail");

          // Navigate to dashboard
          await router.navigate({ to: "/dashboard" });
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "Verification failed";
          setError(errorMessage);
          setLoading(false);
        }
      } else if (event.data.type === "auth:resend") {
        // In a real app, resend the verification code
        console.log("Resending verification code to:", email);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [router, email]);

  return (
    <div>
      <PageFrame src="/pages/verify.html" title="Verify Email" />
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
      {loading && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
            <p className="mt-4 text-center">Verifying your email...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Verify Your Email | ExpertHub" },
      {
        name: "description",
        content: "Verify your email to complete your ExpertHub account setup.",
      },
    ],
  }),
  component: VerifyComponent,
});
