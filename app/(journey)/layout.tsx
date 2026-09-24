import { JourneyProvider } from "@/components/shared/journey-provider";
import type { ReactNode } from "react";

export default function JourneyLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-2.5rem)] bg-ink text-paper font-sans text-[13px] leading-snug antialiased">
      <JourneyProvider>{children}</JourneyProvider>
    </div>
  );
}
