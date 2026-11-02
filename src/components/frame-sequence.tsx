"use client";

import { useEffect, useRef } from "react";
import { gsap } from "../lib/gsap"; // relative, not "@/": vitest here has no path alias and the test imports this file

// Zero-based frame for a scroll progress in [0, 1]. Frame files are numbered from 0001.
export function frameAt(progress: number, count: number) {
  if (count < 1 || Number.isNaN(progress)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(progress * (count - 1))));
}

const AHEAD = 20; // frames kept requested ahead of the current one
const BEHIND = 10; // frames kept behind it, for scrubbing back
const frameUrl =(base: string, set: string, i: number) => `${base}/${set}/${String(i + 1).padStart(4, "0")}.webp`;

// Plays a pre-rendered WebP sequence (`${base}/lg/0001.webp` landscape, `${base}/pt/0001.webp` portrait) on a canvas, scrubbed by scroll.
// No pin: by default the scrub runs while the canvas's parent crosses the viewport, from its top entering at the bottom
// to its bottom reaching 40% below the viewport top (landing spec, bridge section). `start`, `end` and `onProgress`
// override that window and report progress.
type Props = { base: string; count: number; ptCount: number; className?: string; start?: string; end?: string; onProgress?: (p: number) => void };
export function FrameSequence({ base, count, ptCount, className, start = "top bottom", end = "bottom top+=40%", onProgress }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Portrait screens (phones, upright tablets) get the portrait cut, so cover-cropping never cuts the phone off.
    // ponytail: the set is picked once at mount; rotating the device later keeps the first set.
    const portrait = window.matchMedia("(max-aspect-ratio: 4/5)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const set = portrait ? "pt" : "lg";
    const n = portrait ? ptCount : count;
    const frames: (HTMLImageElement | undefined)[] = [];
    let current = reduced ? n - 1 : 0;

    const draw = () => {
      // Fall back to the nearest earlier frame that has loaded, so a fast scroll never blanks the canvas.
      let i = current;
      while (i > 0 && !frames[i]?.complete) i--;
      const img = frames[i];
      if (!img?.complete || !img.naturalWidth) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * s;
      const dh = img.naturalHeight * s;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    };

    const load = (i: number) => {
      if (frames[i]) return;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        if (i <= current) draw();
      };
      img.src = frameUrl(base, set, i);
      frames[i] = img;
    };

    // Poster at once: first frame, or the last one when motion is reduced.
    load(current);

    const resize = new ResizeObserver(draw);
    resize.observe(canvas);
    if (reduced) {
      onProgress?.(1);
      return () => resize.disconnect();
    }

    // Sliding window: keep the next AHEAD frames requested and drop bitmaps far from the current frame, so the
    // network and the decoded-image memory stay small. Dropped frames reload from the HTTP cache if scrolled back to.
    let started = false;
    const fill = () => {
      if (!started) return;
      for (let i = current; i < Math.min(n, current + AHEAD); i++) load(i);
      for (let i = 0; i < frames.length; i++) {
        if (frames[i] && (i < current - BEHIND || i > current + AHEAD * 2)) {
          frames[i]!.onload = null;
          frames[i] = undefined;
        }
      }
    };

    // Start fetching only once the canvas is within half a viewport of the screen (the pin starts when it reaches the top).
    const near = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        near.disconnect();
        started = true;
        fill();
      },
      { rootMargin: "0px 0px 50% 0px" },
    );
    near.observe(canvas);

    const state = { p: 0 };
    const tween = gsap.to(state, {
      p: 1,
      ease: "none",
      scrollTrigger: { trigger: canvas.parentElement ?? canvas, start, end, scrub: 0.6 },
      onUpdate: () => {
        onProgress?.(state.p);
        const next = frameAt(state.p, n);
        if (next === current) return;
        current = next;
        fill();
        draw();
      },
    });

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      near.disconnect();
      resize.disconnect();
      for (const img of frames) if (img) img.onload = null;
    };
  }, [base, count, ptCount, start, end, onProgress]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
