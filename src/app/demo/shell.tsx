"use client";

// /demo layout: the real chat (left) and the live front desk view (right). Phones get two tabs instead.
import { useCallback, useState, type ComponentProps, type CSSProperties } from "react";
import Link from "next/link";
import { RotateCcwIcon } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Chat } from "../chat/[slug]/chat";
import { Desk } from "./desk";

const STARTERS = ["Book a cleaning tomorrow", "What does a check-up cost?", "Do you take Daman?", "I'd like to talk to a person"];

function startOver() {
  try {
    localStorage.removeItem("visitor-id");
  } catch {}
  location.reload();
}

export function DemoShell({ chat, style }: { chat: ComponentProps<typeof Chat>; style?: CSSProperties }) {
  const [tab, setTab] = useState<"chat" | "desk">("chat");
  const [news, setNews] = useState(false);
  const onNews = useCallback(() => setNews(true), []);
  const show = (t: "chat" | "desk") => (setTab(t), t === "desk" && setNews(false));

  return (
    <div style={style} className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-3 sm:px-4">
        <Link href="/" aria-label="Receptionist Agent home">
          <Logo className="text-xl" />
        </Link>
        <p className="hidden min-w-0 truncate text-xs text-muted-foreground md:block">Live demo on a sample clinic. Your test data is deleted after a few hours.</p>
        <Button size="sm" variant="outline" onClick={startOver}>
          <RotateCcwIcon className="size-4" /> Start over
        </Button>
      </header>

      <div role="tablist" aria-label="Demo view" className="flex shrink-0 gap-1 border-b px-3 py-1.5 lg:hidden">
        {(["chat", "desk"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => show(t)}
            className={cn("relative rounded-md px-3 py-1 text-sm font-medium text-muted-foreground", tab === t && "bg-muted text-foreground")}>
            {t === "chat" ? "Chat" : "Front desk"}
            {t === "desk" && news && tab !== "desk" && <span aria-label="new" className="absolute -end-0.5 top-0.5 size-2 rounded-full bg-alert" />}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label="Chat" className={cn("flex min-h-0 flex-col lg:border-e", tab !== "chat" && "max-lg:hidden")}>
          <div className="min-h-0 flex-1">
            <Chat {...chat} embedded starters={STARTERS} />
          </div>
        </section>
        <section aria-label="Front desk view" className={cn("min-h-0 overflow-y-auto bg-sidebar p-3 sm:p-4", tab !== "desk" && "max-lg:hidden")}>
          <Desk persona={chat.persona} onNews={onNews} />
        </section>
      </div>
    </div>
  );
}
