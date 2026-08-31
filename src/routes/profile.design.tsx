import { createFileRoute, redirect } from "@tanstack/react-router";
import { PageFrame } from "@/components/PageFrame";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/profile/design")({
  beforeLoad: async () => {
    const { data, error } = await supabase.from("providers").select("id").limit(1);
    if (error || !data || data.length === 0) {
      throw redirect({ to: "/search" });
    }
  },
  head: () => ({ meta: [{ title: "NINJAWO | Designer Profile" }] }),
  component: () => <PageFrame src="/pages/profile-design.html" title="Designer Profile" />,
});
