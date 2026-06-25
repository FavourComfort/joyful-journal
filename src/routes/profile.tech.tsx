import { createFileRoute } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";

export const Route = createFileRoute("/profile/tech")({
  head: () => ({ meta: [{ title: "ExpertHub | Technician Profile" }] }),
  component: () => <PageFrame src="/pages/profile-tech.html" title="Technician Profile" />,
});
