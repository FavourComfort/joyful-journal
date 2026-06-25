import { createFileRoute } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";

export const Route = createFileRoute("/booking")({
  head: () => ({ meta: [{ title: "ExpertHub | Book Professional Services" }] }),
  component: () => <PageFrame src="/pages/booking.html" title="Booking" />,
});
