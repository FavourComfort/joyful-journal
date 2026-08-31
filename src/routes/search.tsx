import { createFileRoute } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "NINJAWO | Find Professional Services" }] }),
  component: () => <PageFrame src="/pages/search.html" title="Search" />,
});
