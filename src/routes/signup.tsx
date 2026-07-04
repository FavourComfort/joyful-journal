import { createFileRoute } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign Up | ExpertHub" },
      { name: "description", content: "Create your ExpertHub account to find and book vetted professionals." },
    ],
  }),
  component: () => <PageFrame src="/pages/signup.html" title="Sign Up" />,
});
