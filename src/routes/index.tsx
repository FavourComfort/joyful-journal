import { createFileRoute } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ExpertHub | Professional Service Marketplace" },
      { name: "description", content: "Connect with vetted industry leaders and local specialists for your business or home needs." },
      { property: "og:title", content: "ExpertHub | Professional Service Marketplace" },
      { property: "og:description", content: "Vetted experts, transparent pricing, white-glove service." },
    ],
  }),
  component: () => <PageFrame src="/pages/home.html" title="Home" />,
});
