import { createFileRoute } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";

export const Route = createFileRoute("/provider/login")({
  head: () => ({
    meta: [
      { title: "Provider Login | ExpertHub" },
      { name: "description", content: "Sign in to your ExpertHub provider account." },
    ],
  }),
  component: () => <PageFrame src="/pages/provider-login.html" title="Provider Login" />,
});
