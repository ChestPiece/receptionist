import { cn } from "@/lib/utils";

// The brand mark: "Receptionist Agent" in Newsreader with the red alert dot. See .tastemaker/style-lock.md.
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("wordmark text-2xl", className)}>
      Receptionist Agent<span className="text-alert">.</span>
    </span>
  );
}
