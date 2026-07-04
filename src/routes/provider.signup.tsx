import { createFileRoute } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";

export const Route = createFileRoute("/provider/signup")({
  head: () => ({
    meta: [
      { title: "Become a Provider | ExpertHub" },
      { name: "description", content: "Join ExpertHub as a service provider and grow your business." },
    ],
  }),
  component: () => <PageFrame src="/pages/provider-signup.html" title="Become a Provider" />,
});
