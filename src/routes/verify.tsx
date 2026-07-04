import { createFileRoute } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Verify Your Email | ExpertHub" },
      { name: "description", content: "Verify your email to complete your ExpertHub account setup." },
    ],
  }),
  component: () => <PageFrame src="/pages/verify.html" title="Verify Email" />,
});
