"use client";

import { useEffect, useRef } from "react";
import { gsap } from "../lib/gsap"; // relative, not "@/": vitest here has no path alias and the test imports this file

// Zero-based frame for a scroll progress in [0, 1]. Frame files are numbered from 0001.
export function frameAt(progress: number, count: number) {
  if (count < 1 || Number.isNaN(progress)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(progress * (count - 1))));
}

const frameUrl = (base: string, set: string, i: number) => `${base}/${set}/${String(i + 1).padStart(4, "0")}.webp`;

// Plays a pre-rendered WebP sequence (`${base}/lg/0001.webp`, `${base}/sm/0001.webp`) on a canvas, scrubbed by scroll.
// No pin: the scrub runs while the canvas's parent crosses the viewport, from its top entering at the bottom
// to its bottom reaching 40% below the viewport top (landing spec, bridge section).
export function FrameSequence({ base, count, smCount, className }: { base: string; count: number; smCount: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // ponytail: the set is picked once at mount; crossing 768 px later keeps the first set.
    const small = window.matchMedia("(max-width: 767px)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const set = small ? "sm" : "lg";
    const n = small ? smCount : count;
    const frames: HTMLImageElement[] = [];
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
    if (reduced) return () => resize.disconnect();

    // Fetch the rest only once the canvas is within about one viewport.
    const near = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        near.disconnect();
        for (let i = 0; i < n; i++) load(i);
      },
      { rootMargin: "100% 0px" },
    );
    near.observe(canvas);

    const state = { p: 0 };
    const tween = gsap.to(state, {
      p: 1,
      ease: "none",
      scrollTrigger: { trigger: canvas.parentElement ?? canvas, start: "top bottom", end: "bottom top+=40%", scrub: 0.6 },
      onUpdate: () => {
        const next = frameAt(state.p, n);
        if (next === current) return;
        current = next;
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
  }, [base, count, smCount]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
