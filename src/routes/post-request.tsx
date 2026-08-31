import { createFileRoute } from "@tanstack/react-router";
import PostRequestForm from "@/components/PostRequestForm";

function PostRequestComponent() {
  return <PostRequestForm />;
}

export const Route = createFileRoute("/post-request")({
  head: () => ({ meta: [{ title: "Post a Request | NINJAWO" }] }),
  component: PostRequestComponent,
});
