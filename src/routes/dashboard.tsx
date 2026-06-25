import { createFileRoute } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "ExpertHub | Client Dashboard" }] }),
  component: () => <PageFrame src="/pages/dashboard.html" title="Dashboard" />,
});
