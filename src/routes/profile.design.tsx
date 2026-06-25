import { createFileRoute } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";

export const Route = createFileRoute("/profile/design")({
  head: () => ({ meta: [{ title: "ExpertHub | Designer Profile" }] }),
  component: () => <PageFrame src="/pages/profile-design.html" title="Designer Profile" />,
});
