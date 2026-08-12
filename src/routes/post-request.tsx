import { createFileRoute } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";

export const Route = createFileRoute("/post-request")({
  head: () => ({ meta: [{ title: "Post a Request | ExpertHub" }] }),
  component: () => <PageFrame src="/pages/post-request.html" title="Post a Request" />,
});
