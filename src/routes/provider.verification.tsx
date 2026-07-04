import { createFileRoute } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";

export const Route = createFileRoute("/provider/verification")({
  head: () => ({
    meta: [
      { title: "Verify Your Account | ExpertHub" },
      { name: "description", content: "Complete your identity and account verification to become an ExpertHub provider." },
    ],
  }),
  component: () => <PageFrame src="/pages/provider-verification.html" title="Verify Account" />,
});
