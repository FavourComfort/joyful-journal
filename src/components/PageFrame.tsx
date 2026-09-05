import { useRouter } from "@tanstack/react-router";
import { useEffect, type Ref } from "react";

export function PageFrame({
  src,
  title,
  onLoad,
  iframeRef,
}: {
  src: string;
  title: string;
  onLoad?: () => void;
  iframeRef?: Ref<HTMLIFrameElement>;
}) {
  const router = useRouter();

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'navigate') {
        const route = event.data.route;
        // Navigate using the router
        router.navigate({ to: route });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [router]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background">
      <iframe
        key={src}
        ref={iframeRef}
        src={src}
        title={title}
        onLoad={onLoad}
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  );
}
