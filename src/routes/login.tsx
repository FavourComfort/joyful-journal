import { createFileRoute } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login | ExpertHub" },
      { name: "description", content: "Sign in to your ExpertHub account." },
    ],
  }),
  component: () => <PageFrame src="/pages/login.html" title="Login" />,
});
