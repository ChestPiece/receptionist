// Staff reach a patient from their own phone: a tel: link and a wa.me link. No clinic number or API needed.
import { MessageCircleIcon, PhoneIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contactDigits } from "@/lib/phone";
import { cn } from "@/lib/utils";

export function ContactButtons({ phone, waId, name, compact, className }: { phone: string | null; waId: string | null; name: string; compact?: boolean; className?: string }) {
  const d = contactDigits(phone, waId);
  if (!d) return compact ? null : <span className={cn("text-xs text-muted-foreground", className)}>No number yet. Sara asks for one before booking.</span>;
  return (
    <span className={cn("flex shrink-0 items-center gap-1.5", className)}>
      <Button size="sm" variant="outline" asChild className={cn(compact && "max-sm:size-8 max-sm:px-0")}>
        <a href={`tel:+${d}`} aria-label={`Call ${name}`} title={`+${d}`}>
          <PhoneIcon /><span className={cn(compact && "max-sm:sr-only")}>Call</span>
        </a>
      </Button>
      <Button size="sm" variant="outline" asChild className={cn(compact && "max-sm:size-8 max-sm:px-0")}>
        <a href={`https://wa.me/${d}`} target="_blank" rel="noopener noreferrer" aria-label={`Message ${name} on WhatsApp`}>
          <MessageCircleIcon /><span className={cn(compact && "max-sm:sr-only")}>WhatsApp</span>
        </a>
      </Button>
    </span>
  );
}
